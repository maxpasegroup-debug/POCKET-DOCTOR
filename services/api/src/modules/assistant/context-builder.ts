import { membershipAccess, benefitsFor, entitled } from '../membership/entitlements.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Environment } from '../../config/env.js';
import type { Decision, AssistantReply } from './contracts.js';
import { visibleProgramWhere } from '../programs/program-service.js';
import { visibleWellnessWhere } from '../wellness/commerce-service.js';

// The caller binds userId from an authenticated principal. No model-supplied user,
// SQL, URL, or tool arguments are accepted. Facts never go to an external model.
export class AIContextBuilder {
  constructor(private db: Prisma.TransactionClient, private env: Environment, private userId: string) {}
  async facts(intent: Decision['intent']): Promise<AssistantReply['facts']> {
    const userId = this.userId;
    switch (intent) {
      case 'membership': {
        const s = await membershipAccess(this.db, this.env, userId);
        const benefits = await benefitsFor(this.db, this.env, userId);
        return [{ label: 'Your membership', value: s ? `${s.plan.name} · ${s.status}` : 'Free account', route: '/membership' }, ...benefits.map(b => ({ label: 'Member benefit', value: b.label, route: '/membership' }))];
      }
      case 'programs': {
        const data = await this.db.programEnrollment.findMany({ where: { userId, program: visibleProgramWhere(this.env) }, take: 5, orderBy: { enrolledAt: 'desc' },
          select: { id: true, status: true, program: { select: { id: true, title: true, pricePaise: true, isDemo: true, membershipOnly: true } } } });
        const facts: AssistantReply['facts'] = [];
        for (const p of data) {
          if (p.program.membershipOnly && !await entitled(this.db, this.env, userId, 'MEMBER_PROGRAMS', p.program.id)) continue;
          if (p.program.pricePaise > 0 && !await entitled(this.db, this.env, userId, 'PROGRAM_ACCESS', p.program.id) && !await this.db.enrollmentPayment.findFirst({ where: { userId, programId: p.program.id, status: 'VERIFIED', provider: p.program.isDemo ? 'development' : 'razorpay' }, select: { id: true } })) continue;
          const total = await this.db.lesson.count({ where: { required: true, module: { programId: p.program.id } } });
          const completed = await this.db.lessonProgress.count({ where: { enrollmentId: p.id, completedAt: { not: null }, lesson: { required: true } } });
          facts.push({ label: p.program.title, value: `${p.status} · ${completed}/${total} lessons`, route: `/my-programs/${p.program.id}` });
          const sessions = await this.db.liveSession.findMany({ where: { programId: p.program.id, startsAt: { gte: new Date() } }, select: { title: true, startsAt: true }, take: 1, orderBy: { startsAt: 'asc' } });
          for (const session of sessions) facts.push({ label: session.title, value: session.startsAt.toISOString(), route: `/my-programs/${p.program.id}` });
        }
        return facts;
      }
      case 'consultations': case 'prepare': {
        const rows = await this.db.consultation.findMany({ where: { userId, status: { in: ['CONFIRMED', 'IN_PROGRESS'] }, startsAt: { gte: new Date() } },
          select: { id: true, startsAt: true, status: true, doctor: { select: { name: true, isDemo: true } } }, orderBy: { startsAt: 'asc' }, take: 5 });
        return rows.map(r => ({ label: `${r.doctor.isDemo ? 'DEMO · ' : ''}${r.doctor.name}`, value: `${r.startsAt.toISOString()} · ${r.status}`, route: `/consultation/${r.id}` }));
      }
      case 'orders': {
        const rows = await this.db.order.findMany({ where: { userId }, select: { id: true, status: true, isDemo: true }, orderBy: { createdAt: 'desc' }, take: 5 });
        return rows.map(r => ({ label: `${r.isDemo ? 'DEMO · ' : ''}PD-${r.id}`, value: r.status, route: `/orders/${r.id}` }));
      }
      case 'products': {
        const rows = await this.db.wellnessProduct.findMany({ where: visibleWellnessWhere(this.env), select: { id: true, name: true, pricePaise: true, stockQuantity: true, reservedQuantity: true, ingredients: true }, take: 5, orderBy: { createdAt: 'desc' } });
        return rows.map(p => ({ label: p.name, value: `INR ${(p.pricePaise / 100).toFixed(2)} · ${p.stockQuantity > p.reservedQuantity ? 'Available' : 'Unavailable'} · Catalogue materials: ${p.ingredients.slice(0, 300)}`, route: `/products/${p.id}` }));
      }
      case 'goals': {
        const rows = await this.db.wellnessGoal.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 10 });
        const facts = rows.map(r => ({ label: r.title, value: `${r.progress}% · ${r.status} · Your target: ${r.target}`, route: '/assistant/goals' }));
        const prefs = await this.db.aIPreferences.findUnique({ where: { userId } });
        if (prefs?.useMemory) {
          const memories = await this.db.aIMemory.findMany({ where: { userId }, take: 5, orderBy: { updatedAt: 'desc' } });
          facts.push(...memories.map(m => ({ label: 'You asked me to remember', value: m.text, route: '/assistant/memory' })));
        }
        return facts;
      }
      case 'reminders': {
        const rows = await this.db.reminder.findMany({ where: { userId, completed: false }, orderBy: { dueAt: 'asc' }, take: 10 });
        return rows.map(r => ({ label: r.title, value: r.dueAt.toISOString(), route: '/assistant/reminders' }));
      }
      default: return [];
    }
  }
}
