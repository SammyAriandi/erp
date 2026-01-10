import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const mode = process.env.DEPLOYMENT_MODE ?? 'saas';
  const defaultTenantCode = process.env.DEFAULT_TENANT_CODE ?? 'default';

  const tenantCode = mode === 'onprem' ? defaultTenantCode : defaultTenantCode; // tetap seed default tenant
  const tenantName = process.env.DEFAULT_TENANT_NAME ?? 'Default Company';

  const ownerEmail = process.env.SEED_OWNER_EMAIL ?? 'owner@local.test';
  const ownerName = process.env.SEED_OWNER_NAME ?? 'Owner';
  const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? 'ChangeMe123!';

  // Upsert Tenant
  const tenant = await prisma.tenant.upsert({
    where: { code: tenantCode },
    update: { name: tenantName, isActive: true },
    create: { code: tenantCode, name: tenantName, isActive: true },
  });

  const hash = await bcrypt.hash(ownerPassword, 10);

  // Upsert Owner User (unique per tenant+email)
  const user = await prisma.user.upsert({
    where: {
      tenantId_email: {
        tenantId: tenant.id,
        email: ownerEmail.toLowerCase(),
      },
    },
    update: {
      name: ownerName,
      role: 'OWNER',
      isActive: true,
      password: hash,
    },
    create: {
      tenantId: tenant.id,
      email: ownerEmail.toLowerCase(),
      name: ownerName,
      role: 'OWNER',
      isActive: true,
      password: hash,
    },
  });

  console.log('Seed OK:', {
    tenant: { id: tenant.id, code: tenant.code, name: tenant.name },
    owner: { id: user.id, email: user.email, role: user.role },
    mode,
  });
    // --- RBAC bootstrap (roles + permissions) ---
  const permissions = [
    { key: 'tenant.manage', description: 'Manage tenant settings' },
    { key: 'user.manage', description: 'Manage users and roles' },
    { key: 'inventory.read', description: 'View inventory' },
    { key: 'inventory.write', description: 'Create/update inventory data' },
    { key: 'sales.read', description: 'View sales docs' },
    { key: 'sales.write', description: 'Create/update sales docs' },
    { key: 'accounting.read', description: 'View accounting' },
    { key: 'accounting.write', description: 'Create/update accounting' },
    { key: 'accounting.coa.manage', description: 'Manage chart of accounts' },
    { key: 'accounting.journal.write', description: 'Create/update journal drafts' },
    { key: 'accounting.journal.post', description: 'Post journal entries' },

  ];

  // Upsert permissions (global)
  for (const p of permissions) {
    await prisma.permission.upsert({
      where: { key: p.key },
      update: { description: p.description },
      create: { key: p.key, description: p.description },
    });
  }

  // Create system roles per tenant
  const roleOwner = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'OWNER' } },
    update: { isSystem: true },
    create: { tenantId: tenant.id, name: 'OWNER', isSystem: true },
  });

  const roleAdmin = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'ADMIN' } },
    update: { isSystem: true },
    create: { tenantId: tenant.id, name: 'ADMIN', isSystem: true },
  });

  const roleStaff = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'STAFF' } },
    update: { isSystem: true },
    create: { tenantId: tenant.id, name: 'STAFF', isSystem: true },
  });

  // Attach owner user to OWNER role
  await prisma.userRole.upsert({
    where: { tenantId_userId_roleId: { tenantId: tenant.id, userId: user.id, roleId: roleOwner.id } },
    update: {},
    create: { tenantId: tenant.id, userId: user.id, roleId: roleOwner.id },
  });

  // Assign permissions:
  // OWNER: all
  const allPerms = await prisma.permission.findMany();
  for (const perm of allPerms) {
    await prisma.rolePermission.upsert({
      where: { tenantId_roleId_permissionId: { tenantId: tenant.id, roleId: roleOwner.id, permissionId: perm.id } },
      update: {},
      create: { tenantId: tenant.id, roleId: roleOwner.id, permissionId: perm.id },
    });
  }

  // ADMIN: most (exclude tenant.manage if you want)
  const adminPermKeys = allPerms
    .filter(p => p.key !== 'tenant.manage')
    .map(p => p.key);

  for (const key of adminPermKeys) {
    const perm = allPerms.find(p => p.key === key)!;
    await prisma.rolePermission.upsert({
      where: { tenantId_roleId_permissionId: { tenantId: tenant.id, roleId: roleAdmin.id, permissionId: perm.id } },
      update: {},
      create: { tenantId: tenant.id, roleId: roleAdmin.id, permissionId: perm.id },
    });
  }

  // STAFF: read only
  const staffPermKeys = ['inventory.read', 'sales.read', 'accounting.read'];
  for (const key of staffPermKeys) {
    const perm = allPerms.find(p => p.key === key)!;
    await prisma.rolePermission.upsert({
      where: { tenantId_roleId_permissionId: { tenantId: tenant.id, roleId: roleStaff.id, permissionId: perm.id } },
      update: {},
      create: { tenantId: tenant.id, roleId: roleStaff.id, permissionId: perm.id },
    });
  }

}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

  