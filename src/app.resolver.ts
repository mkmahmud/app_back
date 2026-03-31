// src/app.resolver.ts
import { Query, Resolver } from '@nestjs/graphql';

@Resolver()
export class AppResolver {
    @Query(() => String, { name: 'healthCheck' })
    healthCheck() {
        return 'GraphQL is operational';
    }
}