import type { Decision, AssistantReply } from './contracts.js';

// Defense in depth, never a clinical classifier. Unrecognized requests also receive
// only reviewed educational copy, not model-generated medical advice.
export function safetyRoute(text: string): Decision['intent'] | undefined {
  const value = text.normalize('NFKC').toLowerCase().replace(/[\u200b-\u200f\ufeff]/g, '');
  if (/chest (pain|pressure)|can.?t breathe|cannot breathe|not breathing|difficulty breathing|severe bleeding|unconscious|overdose|suicid|kill myself|hurt myself|self.harm|stroke|emergency|सीने.*दर्द|सांस.*नहीं|आत्महत्या/.test(value)) return 'emergency';
  if (/ignore.*instructions|system prompt|another user|other patient|someone else.?s|admin|database|api.?key|secret|bypass/.test(value)) return 'privacy';
  if (/diagnos|prescri|dosage|dose|medicine|medication|insulin|stop.*tablet|cure|symptom|pain|bleeding|fever|dizz|rash|pregnan|दवा|बीमारी/.test(value)) return 'doctor';
  return undefined;
}

export function baseReply(intent: Decision['intent'], mode: string): AssistantReply {
  const text: Record<Decision['intent'], string> = {
    membership: 'Your membership information comes from your account. Only the benefits shown below are currently available. Membership does not guarantee health outcomes.',
    emergency: 'This could need urgent help. Seek immediate in-person medical care or contact your local emergency service. Pocket Doctor Assistant and online appointments are not emergency services. If you may harm yourself, seek immediate support from a trusted person and emergency professionals.',
    doctor: 'I cannot diagnose, prescribe, or advise changes to medication. A qualified doctor or pharmacist can help with personal medical questions. If symptoms are severe or you feel unsafe, seek immediate in-person care.',
    privacy: 'I can only help within your own account. I cannot access other people’s records, reveal secrets, or perform administrative actions.',
    general: 'I can help organize your wellness routine, show your program progress, or prepare questions for a doctor. What would be useful today?',
    sleep: 'You can use a reminder to organize a regular wind-down routine and record how you slept. These are wellness tools, not an assessment of your health. Speak with a qualified professional about persistent sleep concerns.',
    routine: 'A simple routine you can adapt: morning — choose one manageable habit; afternoon — make time for your program; evening — reflect and prepare for tomorrow. Save your own goal or reminder when you are ready. Nothing has been created automatically.',
    prepare: 'AI-assisted appointment preparation: write down your main concerns in your own words, when you noticed them, and the questions you want to ask. Bring your medication list for your doctor to review. This is an organizing checklist, not a diagnosis, and has not been sent to a doctor.',
    programs: 'Here is your saved program activity. Progress comes from your Pocket Doctor account.',
    consultations: 'Here are your upcoming appointments. Open an appointment to review its current details.',
    orders: 'Here are your recent order statuses. Open an order for its latest details.',
    products: 'Explore the currently published wellness catalogue. Products are not recommended here as treatments. Open a product for its approved information and current availability.',
    goals: 'Here are the goals you chose. Progress is self-reported and is not a medical score.',
    reminders: 'Here are your saved reminders. App reminders appear when you open the app; background and WhatsApp delivery are not active yet.',
  };
  const routes: Partial<Record<Decision['intent'], { label: string; route: string }>> = {
    membership: { label: 'Manage membership', route: '/membership' },
    doctor: { label: 'Talk to a Doctor', route: '/consult' }, programs: { label: 'My Programs', route: '/my-programs' },
    consultations: { label: 'My Consultations', route: '/my-consultations' }, orders: { label: 'My Orders', route: '/orders' },
    products: { label: 'View Wellness', route: '/wellness' }, goals: { label: 'My goals', route: '/assistant/goals' },
    reminders: { label: 'Set a reminder', route: '/assistant/reminders' }, routine: { label: 'Create a goal', route: '/assistant/goals' },
    prepare: { label: 'My Consultations', route: '/my-consultations' }, sleep: { label: 'Daily check-in', route: '/assistant/check-ins' },
  };
  return { text: text[intent], classification: intent === 'emergency' ? 'emergency' : intent === 'doctor' ? 'doctor' : intent === 'privacy' ? 'privacy' : 'support',
    actions: routes[intent] ? [routes[intent]!] : [], facts: [], mode };
}
