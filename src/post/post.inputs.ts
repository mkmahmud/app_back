import { InputType, Field, Int } from '@nestjs/graphql'
import { Visibility, ReactionType } from './post.types'

@InputType()
export class CreatePostInput {
  @Field({ nullable: true })
  content?: string

  @Field({ nullable: true })
  imageUrl?: string

  @Field({ nullable: true })
  videoUrl?: string

  @Field(() => Visibility, { defaultValue: Visibility.PUBLIC })
  visibility?: Visibility
}

@InputType()
export class UpdatePostInput {
  @Field(() => String, { nullable: true })
  content?: string | null

  @Field({ nullable: true })
  imageUrl?: string

  @Field({ nullable: true })
  videoUrl?: string

  @Field(() => Visibility, { nullable: true })
  visibility?: Visibility
}

@InputType()
export class PostsFilterInput {
  @Field(() => Int, { defaultValue: 1, nullable: true })
  page?: number

  @Field(() => Int, { defaultValue: 10, nullable: true })
  pageSize?: number

  @Field({ nullable: true })
  authorId?: string

  @Field(() => Visibility, { nullable: true })
  visibility?: Visibility
}

@InputType()
export class CreateCommentInput {
  @Field()
  postId!: string

  @Field()
  content!: string
}

@InputType()
export class ReactToPostInput {
  @Field()
  postId!: string

  @Field(() => ReactionType)
  type!: ReactionType
}
