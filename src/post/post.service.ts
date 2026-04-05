import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type {
  CreatePostInput,
  UpdatePostInput,
  PostsFilterInput,
  CreateCommentInput,
  ReactToPostInput,
} from './post.inputs'
import { ReactionType, Visibility } from './post.types'

@Injectable()
export class PostService {
  private readonly logger = new Logger(PostService.name)

  constructor(private readonly prisma: PrismaService) { }

  // ─── Feed / Get posts ──────────────────────────────────────────────────────

  async findAll(filter: PostsFilterInput, requesterId: string) {
    const page = filter.page ?? 1
    const pageSize = filter.pageSize ?? 10

    const where: Record<string, unknown> = {
      isDeleted: false,
    }

    // Only show PRIVATE posts to their own author
    if (filter.authorId) {
      where.authorId = filter.authorId
      if (filter.authorId !== requesterId) {
        where.visibility = Visibility.PUBLIC
      }
    } else {
      // Feed: show only public posts OR own private posts
      where.OR = [
        { visibility: Visibility.PUBLIC },
        { authorId: requesterId },
      ]
    }

    if (filter.visibility) {
      where.visibility = filter.visibility
    }

    const [rawPosts, total] = await this.prisma.$transaction([
      this.prisma.post.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          author: { select: { id: true, name: true, avatar: true } },
          comments: {
            where: { isDeleted: false },
            orderBy: { createdAt: 'asc' },
            take: 3, // preview comments
            include: {
              author: { select: { id: true, name: true, avatar: true } },
            },
          },
        },
      }),
      this.prisma.post.count({ where }),
    ])

    // Map visibility to local enum
    const posts = rawPosts.map(post => ({
      ...post,
      visibility: Visibility[post.visibility as keyof typeof Visibility],
    }))

    const totalPages = Math.ceil(total / pageSize)

    return {
      posts,
      meta: {
        page,
        pageSize,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    }
  }

  // ─── Get single post ───────────────────────────────────────────────────────

  async findOne(id: string, requesterId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, name: true, avatar: true } },
        comments: {
          where: { isDeleted: false },
          orderBy: { createdAt: 'asc' },
          include: {
            author: { select: { id: true, name: true, avatar: true } },
          },
        },
      },
    })

    if (!post || post.isDeleted) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Post not found' })
    }

    // Private post: only the author can see it
    if (post.visibility === 'PRIVATE' && post.authorId !== requesterId) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'This post is private' })
    }

    return post
  }

  async getPostReactionsCount(postId: string, requesterId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true, visibility: true, isDeleted: true },
    })

    if (!post || post.isDeleted) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Post not found' })
    }

    if (post.visibility === 'PRIVATE' && post.authorId !== requesterId) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'This post is private' })
    }

    return this.prisma.reaction.count({ where: { postId } })
  }

  async getPostReactionsSummary(postId: string, requesterId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true, visibility: true, isDeleted: true },
    })

    if (!post || post.isDeleted) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Post not found' })
    }

    if (post.visibility === 'PRIVATE' && post.authorId !== requesterId) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'This post is private' })
    }

    const reactions = await this.prisma.reaction.findMany({
      where: { postId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
      },
    })

    const totalsByTypeMap = new Map<ReactionType, number>([
      [ReactionType.LIKE, 0],
      [ReactionType.LOVE, 0],
      [ReactionType.HAHA, 0],
      [ReactionType.WOW, 0],
      [ReactionType.SAD, 0],
      [ReactionType.ANGRY, 0],
    ])

    for (const reaction of reactions) {
      const type = reaction.type as ReactionType
      totalsByTypeMap.set(type, (totalsByTypeMap.get(type) ?? 0) + 1)
    }

    return {
      totalReactions: reactions.length,
      totalsByType: Array.from(totalsByTypeMap.entries()).map(([type, count]) => ({
        type,
        count,
      })),
      reactors: reactions.map((reaction) => ({
        userId: reaction.user.id,
        name: reaction.user.name,
        avatar: reaction.user.avatar,
        reactionType: reaction.type as ReactionType,
        reactedAt: reaction.createdAt,
      })),
    }
  }

  // ─── Create post ───────────────────────────────────────────────────────────

  async createPost(input: CreatePostInput, authorId: string) {
    if (!input.content && !input.imageUrl && !input.videoUrl) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Post must have content, an image, or a video',
      })
    }

    return this.prisma.post.create({
      data: {
        content: input.content,
        imageUrl: input.imageUrl,
        videoUrl: input.videoUrl,
        visibility: input.visibility ?? 'PUBLIC',
        authorId,
      },
      include: {
        author: { select: { id: true, name: true, avatar: true } },
        comments: false,
      },
    })
  }

  // ─── Update post ───────────────────────────────────────────────────────────

  async updatePost(id: string, input: UpdatePostInput, requesterId: string) {
    const post = await this.prisma.post.findUnique({ where: { id } })

    if (!post || post.isDeleted) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Post not found' })
    }

    if (post.authorId !== requesterId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You can only edit your own posts',
      })
    }

    return this.prisma.post.update({
      where: { id },
      data: {
        ...(input.content !== undefined && { content: input.content }),
        ...(input.imageUrl !== undefined && { imageUrl: input.imageUrl }),
        ...(input.videoUrl !== undefined && { videoUrl: input.videoUrl }),
        ...(input.visibility !== undefined && { visibility: input.visibility }),
      },
      include: {
        author: { select: { id: true, name: true, avatar: true } },
        comments: {
          where: { isDeleted: false },
          include: { author: { select: { id: true, name: true, avatar: true } } },
        },
      },
    })
  }

  // ─── Delete post ───────────────────────────────────────────────────────────

  async deletePost(id: string, requesterId: string, requesterRole: string) {
    const post = await this.prisma.post.findUnique({ where: { id } })

    if (!post || post.isDeleted) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Post not found' })
    }

    const isOwner = post.authorId === requesterId
    const isAdmin = ['admin', 'superadmin'].includes(requesterRole)

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You can only delete your own posts',
      })
    }

    // Soft delete
    await this.prisma.post.update({
      where: { id },
      data: { isDeleted: true },
    })

    return true
  }

  // ─── Comments ──────────────────────────────────────────────────────────────

  async addComment(input: CreateCommentInput, authorId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: input.postId } })

    if (!post || post.isDeleted) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Post not found' })
    }

    const [comment] = await this.prisma.$transaction([
      this.prisma.comment.create({
        data: {
          content: input.content,
          postId: input.postId,
          authorId,
        },
        include: {
          author: { select: { id: true, name: true, avatar: true } },
        },
      }),
      // Increment comment count
      this.prisma.post.update({
        where: { id: input.postId },
        data: { commentCount: { increment: 1 } },
      }),
    ])

    return comment
  }

  async deleteComment(commentId: string, requesterId: string, requesterRole: string) {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } })

    if (!comment || comment.isDeleted) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Comment not found' })
    }

    const isOwner = comment.authorId === requesterId
    const isAdmin = ['admin', 'superadmin'].includes(requesterRole)

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You can only delete your own comments',
      })
    }

    await this.prisma.$transaction([
      this.prisma.comment.update({
        where: { id: commentId },
        data: { isDeleted: true },
      }),
      this.prisma.post.update({
        where: { id: comment.postId },
        data: { commentCount: { decrement: 1 } },
      }),
    ])

    return true
  }

  // ─── Reactions ─────────────────────────────────────────────────────────────

  async reactToPost(input: ReactToPostInput, userId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: input.postId } })
    if (!post || post.isDeleted) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Post not found' })
    }

    // Upsert reaction (change type if already reacted)
    const existing = await this.prisma.reaction.findUnique({
      where: { userId_postId: { userId, postId: input.postId } },
    })

    if (existing) {
      if (existing.type === input.type) {
        // Same reaction → remove it (toggle off)
        await this.prisma.$transaction([
          this.prisma.reaction.delete({ where: { id: existing.id } }),
          this.prisma.post.update({
            where: { id: input.postId },
            data: { likeCount: { decrement: 1 } },
          }),
        ])
      } else {
        // Different reaction → update type
        await this.prisma.reaction.update({
          where: { id: existing.id },
          data: { type: input.type },
        })
      }
    } else {
      // New reaction
      await this.prisma.$transaction([
        this.prisma.reaction.create({
          data: { type: input.type, userId, postId: input.postId },
        }),
        this.prisma.post.update({
          where: { id: input.postId },
          data: { likeCount: { increment: 1 } },
        }),
      ])
    }

    const updatedPost = await this.prisma.post.findUnique({ where: { id: input.postId } })

    return {
      type: input.type,
      totalLikes: updatedPost?.likeCount ?? 0,
    }
  }

  // ─── Saved posts ───────────────────────────────────────────────────────────

  async savePost(postId: string, userId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } })
    if (!post || post.isDeleted) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Post not found' })
    }

    const existing = await this.prisma.savedPost.findUnique({
      where: { userId_postId: { userId, postId } },
    })

    if (existing) {
      await this.prisma.savedPost.delete({ where: { id: existing.id } })
      return false // unsaved
    }

    await this.prisma.savedPost.create({ data: { userId, postId } })
    return true // saved
  }

  async getSavedPosts(userId: string) {
    const saved = await this.prisma.savedPost.findMany({
      where: { userId },
      orderBy: { savedAt: 'desc' },
      include: {
        post: {
          include: {
            author: { select: { id: true, name: true, avatar: true } },
            comments: {
              where: { isDeleted: false },
              take: 3,
              include: { author: { select: { id: true, name: true, avatar: true } } },
            },
          },
        },
      },
    })

    return saved.filter(s => !s.post.isDeleted).map(s => s.post)
  }
}
