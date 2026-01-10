export type JwtPayload = {
  sub: string;
  tenantId: string;
  role: 'OWNER' | 'ADMIN' | 'STAFF';
  email: string;
};
