export const ADMIN_SIIAU_CODES = new Set<string>([
  '218542692',
  '218433044',
]);

export function isAdminSiiauCode(code: string | null | undefined): boolean {
  if (!code) return false;
  return ADMIN_SIIAU_CODES.has(code.trim());
}
