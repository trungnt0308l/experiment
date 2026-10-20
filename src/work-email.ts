export const PERSONAL_EMAIL_DOMAINS = [
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.co.uk', 'hotmail.fr', 'hotmail.de', 'hotmail.it',
  'hotmail.es', 'hotmail.ca', 'hotmail.com.au', 'outlook.com', 'outlook.co.uk', 'outlook.fr', 'outlook.de',
  'outlook.es', 'outlook.it', 'live.com', 'live.co.uk', 'live.fr', 'live.de', 'live.nl', 'live.ca', 'msn.com',
  'yahoo.com', 'yahoo.co.uk', 'yahoo.co.jp', 'yahoo.fr', 'yahoo.de', 'yahoo.it', 'yahoo.es', 'yahoo.ca',
  'yahoo.com.au', 'yahoo.com.br', 'yahoo.co.in', 'ymail.com', 'rocketmail.com', 'aol.com', 'aim.com',
  'icloud.com', 'me.com', 'mac.com', 'proton.me', 'protonmail.com', 'pm.me', 'tuta.com', 'tutanota.com',
  'tutanota.de', 'mail.com', 'email.com', 'gmx.com', 'gmx.net', 'gmx.de', 'web.de', 'mail.ru', 'inbox.ru',
  'list.ru', 'bk.ru', 'yandex.com', 'yandex.ru', 'ya.ru', 'qq.com', 'foxmail.com', '163.com', '126.com',
  'sina.com', 'sohu.com', 'naver.com', 'daum.net', 'hanmail.net', 'zoho.com', 'zohomail.com',
  'fastmail.com', 'fastmail.fm', 'hey.com', 'hushmail.com', 'lycos.com', 'rediffmail.com', 'inbox.com',
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'sharklasers.com', 'grr.la', 'yopmail.com',
  'yopmail.fr', '10minutemail.com', 'temp-mail.org', 'tempmail.com', 'dispostable.com', 'getnada.com',
] as const;

export function workEmailError(value: unknown, blocked: readonly string[] = PERSONAL_EMAIL_DOMAINS): string | null {
  if (typeof value !== 'string') return 'Please enter a valid work email.';
  const email = value.trim().toLowerCase();
  const parts = email.split('@');
  if (email.length > 200 || parts.length !== 2 || !/^[a-z0-9!#$%&'*+/=?^_`{|}~.-]{1,64}$/.test(parts[0])
    || parts[0].startsWith('.') || parts[0].endsWith('.') || parts[0].includes('..')) return 'Please enter a valid work email.';
  const domain = parts[1];
  if (!domain.includes('.') || !domain.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
    || !/\.[a-z]{2,63}$/.test(domain)) return 'Please enter a valid work email.';
  if (blocked.some(provider => domain === provider || domain.endsWith(`.${provider}`)))
    return 'Please use your company email. Personal and temporary email addresses are not supported.';
  return null;
}
