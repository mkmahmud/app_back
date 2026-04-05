import { Query, Resolver } from '@nestjs/graphql'
import { Public } from './common/decorators/auth.decorators'

@Resolver()
export class AppResolver {
  @Query(() => String, { name: 'healthCheck', description: 'GraphQL health check' })
  @Public()
  healthCheck(): string {
    return 'GraphQL is operational'
  }
}
