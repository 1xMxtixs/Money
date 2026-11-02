// Límites compartidos por el esquema del servidor y los formularios del cliente.
// Módulo sin dependencias: seguro de importar desde componentes cliente (no arrastra argon2).
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const EMAIL_MAX_LENGTH = 254;
export const INVITATION_CODE_MAX_LENGTH = 32;
