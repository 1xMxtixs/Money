import { apiHandler, createdResponse } from '@/lib/api/handler';
import { conflict } from '@/lib/api/problem';
import { hashInvitationCode, normalizeInvitationCode } from '@/lib/auth/invitations';
import { cookieHeaders, toUserDto } from '@/lib/auth/http';
import { hashPassword, isCommonPassword } from '@/lib/auth/password';
import { prepareSession } from '@/lib/auth/session';
import { uuidv7 } from '@/lib/domain/id/uuidv7';
import { unscopedRegisterUser } from '@/lib/repos/users';
import { registerSchema, type RegisterInput } from '@/lib/schemas/auth';

const invitationInvalid = () => conflict('INVITATION_INVALID', 'Invalid invitation');

export const POST = apiHandler<RegisterInput>(
  async ({ req, body }) => {
    const code = normalizeInvitationCode(body.invitationCode);
    if (!code) throw invitationInvalid();

    // La sesión se prepara en memoria y se inserta dentro de la transacción del alta.
    const { data: sessionData, cookie } = prepareSession(req.headers.get('user-agent'));
    const result = await unscopedRegisterUser(
      {
        id: uuidv7(),
        email: body.email,
        passwordHash: await hashPassword(body.password),
        ...(body.locale && { locale: body.locale }),
        ...(body.timezone && { timezone: body.timezone }),
        // ponytail: el consentimiento real llega en F3-06; la columna es NOT NULL.
        consentVersion: 'pending-f3-06',
        consentAcceptedAt: new Date(),
      },
      hashInvitationCode(code),
      sessionData
    );

    if (result.status === 'invitation_invalid') throw invitationInvalid();
    if (result.status === 'email_taken') {
      throw conflict('EMAIL_TAKEN', 'Email already registered');
    }

    return createdResponse(
      {
        user: toUserDto(result.user),
        // Aviso, no bloqueo (F0-09): la contraseña figura entre las más comunes.
        ...(isCommonPassword(body.password) && { warnings: ['PASSWORD_COMMON'] }),
      },
      cookieHeaders(cookie)
    );
  },
  { bodySchema: registerSchema }
);
