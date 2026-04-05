import {
  Resolver,
  Query,
  Mutation,
  Args,
  ID,
  Int,
  Context,
} from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import { PostService } from './post.service'

import {
  CreatePostInput,
  UpdatePostInput,
  PostsFilterInput,
  CreateCommentInput,
  ReactToPostInput,
} from './post.inputs'
import { JwtAuthGuard } from '../common/guards'
import { CurrentUserId, CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator'
import {
  PaginatedPosts,
  Post,
  ReactionResult,
  Comment,
  PostReactionsSummary,
} from './post.types'

@Resolver(() => Post)
@UseGuards(JwtAuthGuard)
export class PostResolver {
  constructor(private readonly postService: PostService) { }

  // ─── Queries ───────────────────────────────────────────────────────────────

  /**
   * Get paginated feed of posts.
   * Public endpoint: authenticated users see private posts they own,
   * unauthenticated users (if @Public is used) see only public posts.
   */
  @Query(() => PaginatedPosts, { name: 'posts', description: 'Get paginated feed of posts' })
  async getPosts(
    @Args('filter', { nullable: true }) filter: PostsFilterInput = {},
    @CurrentUserId() userId: string,
  ): Promise<PaginatedPosts> {
    return this.postService.findAll(filter, userId)
  }

  /**
   * Get a single post by ID.
   */
  @Query(() => Post, { name: 'post', description: 'Get a single post by ID' })
  async getPost(
    @Args('id', { type: () => ID }) id: string,
    @CurrentUserId() userId: string,
  ): Promise<Post> {
    return this.postService.findOne(id, userId) as unknown as Post
  }

  @Query(() => Int, {
    name: 'postReactionCount',
    description: 'Get total reactions for a specific post',
  })
  async getPostReactionCount(
    @Args('postId', { type: () => ID }) postId: string,
    @CurrentUserId() userId: string,
  ): Promise<number> {
    return this.postService.getPostReactionsCount(postId, userId)
  }

  @Query(() => PostReactionsSummary, {
    name: 'postReactionsSummary',
    description: 'Get total reactions, totals by type, and user-wise reactors for a post',
  })
  async getPostReactionsSummary(
    @Args('postId', { type: () => ID }) postId: string,
    @CurrentUserId() userId: string,
  ): Promise<PostReactionsSummary> {
    return this.postService.getPostReactionsSummary(postId, userId)
  }

  /**
   * Get saved posts for the current user.
   */
  @Query(() => [Post], { name: 'savedPosts', description: 'Get saved posts for the current user' })
  async getSavedPosts(@CurrentUserId() userId: string): Promise<Post[]> {
    return this.postService.getSavedPosts(userId) as unknown as Post[]
  }

  // ─── Mutations ─────────────────────────────────────────────────────────────

  /**
   * Create a new post.
   */
  @Mutation(() => Post, { description: 'Create a new post' })
  async createPost(
    @Args('input') input: CreatePostInput,
    @CurrentUserId() userId: string,
  ): Promise<Post> {
    return this.postService.createPost(input, userId) as unknown as Post
  }

  /**
   * Update an existing post (author only).
   */
  @Mutation(() => Post, { description: 'Update a post (author only)' })
  async updatePost(
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdatePostInput,
    @CurrentUserId() userId: string,
  ): Promise<Post> {
    return this.postService.updatePost(id, input, userId) as unknown as Post
  }

  /**
   * Delete a post (author or admin).
   */
  @Mutation(() => Boolean, { description: 'Delete a post (author or admin)' })
  async deletePost(
    @Args('id', { type: () => ID }) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<boolean> {
    return this.postService.deletePost(id, user.sub, user.role)
  }

  /**
   * Add a comment to a post.
   */
  @Mutation(() => Comment, { description: 'Add a comment to a post' })
  async addComment(
    @Args('input') input: CreateCommentInput,
    @CurrentUserId() userId: string,
  ): Promise<Comment> {
    return this.postService.addComment(input, userId) as unknown as Comment
  }

  /**
   * Delete a comment (author or admin).
   */
  @Mutation(() => Boolean, { description: 'Delete a comment (author or admin)' })
  async deleteComment(
    @Args('id', { type: () => ID }) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<boolean> {
    return this.postService.deleteComment(id, user.sub, user.role)
  }

  /**
   * React to a post (like, love, etc.). Calling again with the same type removes the reaction.
   */
  @Mutation(() => ReactionResult, { description: 'React to a post. Same type again = toggle off.' })
  async reactToPost(
    @Args('input') input: ReactToPostInput,
    @CurrentUserId() userId: string,
  ): Promise<ReactionResult> {
    return this.postService.reactToPost(input, userId)
  }

  /**
   * Save or unsave a post. Returns true if saved, false if unsaved.
   */
  @Mutation(() => Boolean, { description: 'Toggle save/unsave a post' })
  async savePost(
    @Args('postId', { type: () => ID }) postId: string,
    @CurrentUserId() userId: string,
  ): Promise<boolean> {
    return this.postService.savePost(postId, userId)
  }
}
