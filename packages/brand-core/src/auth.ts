export type Role = 'guest' | 'agent' | 'editor' | 'owner' | 'finance' | 'design' | 'marketing'
export type Audience = 'public' | 'internal' | 'restricted'
export type Operation = 'read' | 'write' | 'approve' | 'export'

export interface AuthContext {
  principal_id: string
  role: Role
  brand_id: string
  audience: Audience
  scopes: string[]
}

export interface ResourceRef {
  brand_id: string
  classification: Audience
  status?: string
  publication?: 'unpublished' | 'published'
}

const RANK: Record<Audience, number> = { public: 0, internal: 1, restricted: 2 }

export function guestContext(brandId: string): AuthContext {
  return { principal_id: 'anonymous', role: 'guest', brand_id: brandId, audience: 'public', scopes: ['read'] }
}

export function agentContext(brandId: string): AuthContext {
  return { principal_id: 'local-agent', role: 'agent', brand_id: brandId, audience: 'public', scopes: ['read'] }
}

export function authorize(ctx: AuthContext, resource: ResourceRef, operation: Operation): { allow: boolean; reason: string } {
  if (ctx.brand_id !== resource.brand_id) return { allow: false, reason: 'cross-brand' }
  if (operation === 'approve') {
    if (ctx.role === 'agent' || ctx.role === 'guest') return { allow: false, reason: 'agents and guests cannot approve' }
    if (!ctx.scopes.includes('approve')) return { allow: false, reason: 'missing approve scope' }
  }
  if (operation === 'write' && !ctx.scopes.includes('write') && !ctx.scopes.includes('approve')) {
    return { allow: false, reason: 'missing write scope' }
  }
  if (RANK[resource.classification] > RANK[ctx.audience]) return { allow: false, reason: 'audience' }
  if (resource.classification === 'restricted' && !ctx.scopes.includes('restricted')) return { allow: false, reason: 'missing restricted scope' }
  if (ctx.audience === 'public' || ctx.role === 'guest' || ctx.role === 'agent') {
    if (resource.status !== 'approved' || resource.publication !== 'published' || resource.classification !== 'public') {
      return { allow: false, reason: 'public readers only receive published public facts' }
    }
  }
  return { allow: true, reason: 'allowed' }
}
