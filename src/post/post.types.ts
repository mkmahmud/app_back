import { ObjectType, Field, ID, Int, registerEnumType } from '@nestjs/graphql'

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum Visibility {
  PUBLIC = 'PUBLIC',
  PRIVATE = 'PRIVATE',
}

export enum ReactionType {
  LIKE = 'LIKE',
  LOVE = 'LOVE',
  HAHA = 'HAHA',
  WOW = 'WOW',
  SAD = 'SAD',
  ANGRY = 'ANGRY',
}

registerEnumType(Visibility, { name: 'Visibility' })
registerEnumType(ReactionType, { name: 'ReactionType' })

// ─── Author (lightweight) ─────────────────────────────────────────────────────

@ObjectType()
export class PostAuthor {
  @Field(() => ID)
  id!: string

  @Field()
  name!: string

  @Field(() => String, { nullable: true })
  avatar?: string | null
}

// ─── Comment ──────────────────────────────────────────────────────────────────

@ObjectType()
export class Comment {
  @Field(() => ID)
  id!: string

  @Field(() => String, { nullable: true })
  content?: string | null

  @Field()
  isDeleted!: boolean

  @Field(() => PostAuthor)
  author!: PostAuthor

  @Field()
  createdAt!: Date

  @Field()
  updatedAt!: Date
}

// ─── Post ─────────────────────────────────────────────────────────────────────

@ObjectType()
export class Post {
  @Field(() => ID)
  id!: string

  @Field(() => String, { nullable: true })
  content?: string | null

  @Field(() => String, { nullable: true })
  imageUrl?: string | null

  @Field(() => String, { nullable: true })
  videoUrl?: string | null

  @Field(() => Visibility)
  visibility!: Visibility

  @Field()
  isDeleted!: boolean

  @Field(() => Int)
  likeCount!: number

  @Field(() => Int)
  commentCount!: number

  @Field(() => Int)
  shareCount!: number

  @Field(() => PostAuthor)
  author!: PostAuthor

  @Field(() => [Comment], { nullable: true })
  comments?: Comment[]

  @Field()
  createdAt!: Date

  @Field()
  updatedAt!: Date
}

// ─── Paginated Posts ──────────────────────────────────────────────────────────

@ObjectType()
export class PostMeta {
  @Field(() => Int)
  page!: number

  @Field(() => Int)
  pageSize!: number

  @Field(() => Int)
  total!: number

  @Field(() => Int)
  totalPages!: number

  @Field()
  hasNextPage!: boolean

  @Field()
  hasPreviousPage!: boolean
}

@ObjectType()
export class PaginatedPosts {
  @Field(() => [Post])
  posts!: Post[]

  @Field(() => PostMeta)
  meta!: PostMeta
}

// ─── Reaction result ──────────────────────────────────────────────────────────

@ObjectType()
export class ReactionResult {
  @Field(() => ReactionType)
  type!: ReactionType

  @Field(() => Int)
  totalLikes!: number
}

@ObjectType()
export class ReactionTypeCount {
  @Field(() => ReactionType)
  type!: ReactionType

  @Field(() => Int)
  count!: number
}

@ObjectType()
export class PostReactionUser {
  @Field(() => ID)
  userId!: string

  @Field()
  name!: string

  @Field(() => String, { nullable: true })
  avatar?: string | null

  @Field(() => ReactionType)
  reactionType!: ReactionType

  @Field()
  reactedAt!: Date
}

@ObjectType()
export class PostReactionsSummary {
  @Field(() => Int)
  totalReactions!: number

  @Field(() => [ReactionTypeCount])
  totalsByType!: ReactionTypeCount[]

  @Field(() => [PostReactionUser])
  reactors!: PostReactionUser[]
}
