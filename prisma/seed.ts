import { PrismaClient, ReactionType, Role, Visibility } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const USER_COUNT = 100;
const POST_COUNT = 1100;
const COMMENT_COUNT = 3300;
const REPLY_COUNT = 4400;
const POST_REACTION_COUNT = 7700;
const COMMENT_REACTION_COUNT = 4400;
const REPLY_REACTION_COUNT = 3300;
const CHUNK_SIZE = 1000;
const UPDATE_CHUNK_SIZE = 200;

type ReactionSeed = {
    userId: string;
    type: ReactionType;
    postId?: string;
    commentId?: string;
    replyId?: string;
};

const reactionTypes = [
    ReactionType.LIKE,
    ReactionType.LOVE,
    ReactionType.HAHA,
    ReactionType.WOW,
    ReactionType.SAD,
    ReactionType.ANGRY,
];

function chunkArray<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
}

function pickRandom<T>(items: T[]): T {
    return items[Math.floor(Math.random() * items.length)];
}

function randomSentence(prefix: string, index: number): string {
    const topics = [
        'product updates',
        'design cleanup',
        'customer feedback',
        'release planning',
        'performance tuning',
        'api docs',
        'testing habits',
        'automation wins',
    ];
    const endings = [
        'Shared with the team for review.',
        'Curious how others would approach this.',
        'Small steps are compounding nicely.',
        'This should improve reliability over time.',
        'Next step is measuring impact clearly.',
    ];
    return `${prefix} #${index + 1}: ${pickRandom(topics)}. ${pickRandom(endings)}`;
}

function buildTargetsWithCoverage(targetIds: string[], count: number): string[] {
    if (targetIds.length === 0 || count <= 0) {
        return [];
    }

    const targets: string[] = [];

    for (let i = 0; i < count; i += 1) {
        if (i < targetIds.length) {
            targets.push(targetIds[i]);
        } else {
            targets.push(pickRandom(targetIds));
        }
    }

    return targets;
}

function buildUniqueReactions(params: {
    userIds: string[];
    targetIds: string[];
    targetField: 'postId' | 'commentId' | 'replyId';
    requestedCount: number;
}): ReactionSeed[] {
    const { userIds, targetIds, targetField, requestedCount } = params;

    if (userIds.length === 0 || targetIds.length === 0 || requestedCount <= 0) {
        return [];
    }

    const maxUnique = userIds.length * targetIds.length;
    const targetCount = Math.min(requestedCount, maxUnique);
    const usedPairs = new Set<string>();
    const reactions: ReactionSeed[] = [];

    if (targetCount >= targetIds.length) {
        for (const targetId of targetIds) {
            const userId = pickRandom(userIds);
            const key = `${userId}:${targetId}`;
            if (usedPairs.has(key)) {
                continue;
            }
            usedPairs.add(key);
            reactions.push({
                userId,
                type: pickRandom(reactionTypes),
                [targetField]: targetId,
            });
        }
    }

    while (reactions.length < targetCount) {
        const userId = pickRandom(userIds);
        const targetId = pickRandom(targetIds);
        const key = `${userId}:${targetId}`;

        if (usedPairs.has(key)) {
            continue;
        }

        usedPairs.add(key);

        reactions.push({
            userId,
            type: pickRandom(reactionTypes),
            [targetField]: targetId,
        });
    }

    return reactions;
}

async function main() {
    const passwordHash = await bcrypt.hash('Password123!', 10);

    const userSeeds = Array.from({ length: USER_COUNT }, (_, index) => {
        const id = index + 1;
        const padded = String(id).padStart(3, '0');
        return {
            email: `user${padded}@appifylab.dev`,
            name: `Seed User ${padded}`,
            role: id === 1 ? Role.admin : Role.user,
            avatar: `https://i.pravatar.cc/150?img=${(id % 70) + 1}`,
        };
    });

    const users = await Promise.all(
        userSeeds.map((seed) =>
            prisma.user.upsert({
                where: { email: seed.email },
                update: {
                    name: seed.name,
                    role: seed.role,
                    avatar: seed.avatar,
                    password: passwordHash,
                    isEmailVerified: true,
                    isActive: true,
                },
                create: {
                    email: seed.email,
                    name: seed.name,
                    role: seed.role,
                    avatar: seed.avatar,
                    password: passwordHash,
                    isEmailVerified: true,
                    isActive: true,
                },
            }),
        ),
    );

    const userIds = users.map((user) => user.id);

    // Reset feed-related tables so the seed is repeatable.
    await prisma.reaction.deleteMany({});
    await prisma.reply.deleteMany({});
    await prisma.comment.deleteMany({});
    await prisma.savedPost.deleteMany({});
    await prisma.post.deleteMany({});

    const posts = Array.from({ length: POST_COUNT }, (_, index) => ({
        id: crypto.randomUUID(),
        authorId: pickRandom(userIds),
        content: randomSentence('Post update', index),
        visibility: Math.random() < 0.9 ? Visibility.PUBLIC : Visibility.PRIVATE,
        imageUrl:
            Math.random() < 0.35
                ? `https://picsum.photos/seed/post-${index + 1}/1200/800`
                : null,
    }));

    for (const batch of chunkArray(posts, CHUNK_SIZE)) {
        await prisma.post.createMany({ data: batch });
    }

    const postIds = posts.map((post) => post.id);

    const commentTargets = buildTargetsWithCoverage(postIds, COMMENT_COUNT);

    const comments = Array.from({ length: COMMENT_COUNT }, (_, index) => ({
        id: crypto.randomUUID(),
        postId: commentTargets[index],
        authorId: pickRandom(userIds),
        content: randomSentence('Comment note', index),
    }));

    for (const batch of chunkArray(comments, CHUNK_SIZE)) {
        await prisma.comment.createMany({ data: batch });
    }

    const commentIds = comments.map((comment) => comment.id);

    const replies = Array.from({ length: REPLY_COUNT }, (_, index) => ({
        id: crypto.randomUUID(),
        commentId: pickRandom(commentIds),
        authorId: pickRandom(userIds),
        content: randomSentence('Reply insight', index),
    }));

    for (const batch of chunkArray(replies, CHUNK_SIZE)) {
        await prisma.reply.createMany({ data: batch });
    }

    const replyIds = replies.map((reply) => reply.id);

    const postReactions = buildUniqueReactions({
        userIds,
        targetIds: postIds,
        targetField: 'postId',
        requestedCount: POST_REACTION_COUNT,
    });

    const commentReactions = buildUniqueReactions({
        userIds,
        targetIds: commentIds,
        targetField: 'commentId',
        requestedCount: COMMENT_REACTION_COUNT,
    });

    const replyReactions = buildUniqueReactions({
        userIds,
        targetIds: replyIds,
        targetField: 'replyId',
        requestedCount: REPLY_REACTION_COUNT,
    });

    const reactions = [...postReactions, ...commentReactions, ...replyReactions];

    for (const batch of chunkArray(reactions, CHUNK_SIZE)) {
        await prisma.reaction.createMany({ data: batch });
    }

    const postCommentCountMap = new Map<string, number>();
    for (const comment of comments) {
        postCommentCountMap.set(comment.postId, (postCommentCountMap.get(comment.postId) ?? 0) + 1);
    }

    const postReactionCountMap = new Map<string, number>();
    for (const reaction of postReactions) {
        if (!reaction.postId) {
            continue;
        }
        postReactionCountMap.set(
            reaction.postId,
            (postReactionCountMap.get(reaction.postId) ?? 0) + 1,
        );
    }

    const postUpdateJobs = posts.map((post) =>
        prisma.post.update({
            where: { id: post.id },
            data: {
                commentCount: postCommentCountMap.get(post.id) ?? 0,
                likeCount: postReactionCountMap.get(post.id) ?? 0,
            },
        }),
    );

    for (const batch of chunkArray(postUpdateJobs, UPDATE_CHUNK_SIZE)) {
        await prisma.$transaction(batch);
    }

    const [postCount, commentCount, replyCount, reactionCount, postLikeTotal, postCommentTotal] =
        await Promise.all([
            prisma.post.count(),
            prisma.comment.count(),
            prisma.reply.count(),
            prisma.reaction.count(),
            prisma.post.aggregate({ _sum: { likeCount: true } }),
            prisma.post.aggregate({ _sum: { commentCount: true } }),
        ]);

    console.log('Seed complete.');
    console.log(`Users: ${users.length}`);
    console.log(`Posts: ${postCount}`);
    console.log(`Comments: ${commentCount}`);
    console.log(`Replies: ${replyCount}`);
    console.log(`Reactions: ${reactionCount}`);
    console.log(`Post likeCount total: ${postLikeTotal._sum.likeCount ?? 0}`);
    console.log(`Post commentCount total: ${postCommentTotal._sum.commentCount ?? 0}`);
}

main()
    .catch(async (error) => {
        console.error('Seed failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
