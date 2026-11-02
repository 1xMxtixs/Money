import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { createInvitation } from '../lib/auth/invitations';

// Uso: npm run invite [-- correo@ejemplo.com]
async function main() {
  const { code, invitation } = await createInvitation(process.argv[2]);
  console.log(`Código (se muestra una sola vez): ${code}`);
  console.log(`Caduca: ${invitation.expiresAt.toISOString()}`);
  if (invitation.invitedEmail) console.log(`Solo para: ${invitation.invitedEmail}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Invite failed:', err);
    process.exit(1);
  });
