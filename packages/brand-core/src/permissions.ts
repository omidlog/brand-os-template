import type { FieldQuestion } from './types.js'

export type ApprovalGrant = 'financial' | 'visual' | 'public_copy' | 'canonical'

const GRANTS: Record<string, ApprovalGrant[]> = {
  owner: ['financial', 'visual', 'public_copy', 'canonical'],
  design: ['visual'],
  finance: ['financial'],
  marketing: ['public_copy'],
  guest: [],
}

export function permissionFor(question: FieldQuestion): ApprovalGrant {
  if (
    question.sensitivity === 'restricted' ||
    question.id.includes('finance') ||
    question.id.includes('pricing') ||
    question.id.includes('budget') ||
    question.id.includes('.share')
  ) {
    return 'financial'
  }
  const visualModules = new Set([
    'logo-system',
    'color-system',
    'typography',
    'mascot-identity',
    'mascot-expression',
    'mascot-evolution',
    'illustration',
    'iconography',
    'motion',
    'photo-video',
    'layout',
  ])
  if (visualModules.has(question.module)) return 'visual'
  if (question.sensitivity === 'public') return 'public_copy'
  return 'canonical'
}

export function canApprove(actor: string, question: FieldQuestion): boolean {
  return (GRANTS[actor] ?? []).includes(permissionFor(question))
}
