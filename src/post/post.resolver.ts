import { Resolver, Mutation, Args, InputType, Field, ObjectType, Query } from '@nestjs/graphql';
import { Injectable } from '@nestjs/common';
import { PostService } from './post.service';

@InputType()
class CreatePostInput {
    @Field({ nullable: true })
    content?: string;

    @Field({ nullable: true })
    imageUrl?: string;

    @Field({ nullable: true })
    videoUrl?: string;

    @Field({ defaultValue: 'PUBLIC' })
    visibility?: 'PUBLIC' | 'PRIVATE';

    @Field()
    authorId: string;
}

@ObjectType()
class Post {
    @Field()
    id: string;

    @Field({ nullable: true })
    content?: string | null;

    @Field({ nullable: true })
    imageUrl?: string | null;

    @Field({ nullable: true })
    videoUrl?: string | null;

    @Field()
    visibility: 'PUBLIC' | 'PRIVATE';

    @Field()
    authorId: string;
}

@Injectable()
@Resolver(() => Post)
export class PostResolver {
    constructor(private readonly postService: PostService) { }

    @Query(() => String)
    hello(): string {
        return 'Hello GraphQL!';
    }

    @Mutation(() => Post)
    async createPost(@Args('input') input: CreatePostInput): Promise<Post> {
        return this.postService.createPost(input);
    }
}
