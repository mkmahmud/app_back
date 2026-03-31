import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface CreatePostInput {
    content?: string;
    imageUrl?: string;
    videoUrl?: string;
    visibility?: 'PUBLIC' | 'PRIVATE';
    authorId: string;
}

@Injectable()
export class PostService {
    constructor(private readonly prisma: PrismaService) { }

    async createPost(input: CreatePostInput) {
        return this.prisma.post.create({
            data: {
                content: input.content,
                imageUrl: input.imageUrl,
                videoUrl: input.videoUrl,
                visibility: input.visibility || 'PUBLIC',
                authorId: input.authorId,
            },
        });
    }
}
