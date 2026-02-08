import { z } from 'astro/zod';
import { ActionError, defineAction } from 'astro:actions';
import type { JoinWaitlistResponse } from './types';
import { b64, str2ab } from './utils';

let GoogleSpreadsheet: typeof import('google-spreadsheet').GoogleSpreadsheet;
let JWT: typeof import('google-auth-library').JWT;

if (import.meta.env.DEV) {
  const googleSpreadsheet = await import('google-spreadsheet');
  const googleAuth = await import('google-auth-library');

  GoogleSpreadsheet = googleSpreadsheet.GoogleSpreadsheet;
  JWT = googleAuth.JWT;
}

const nameSchema = z
  .string({
    required_error: 'Please enter your name',
    invalid_type_error: 'Please enter your name',
  })
  .min(1, { message: 'Please enter your name' })
  .min(2, { message: 'Name should be at least 2 characters' })
  .max(50, { message: 'Name is too long (maximum 50 characters)' })
  .trim()
  .regex(/^[a-zA-Z\s\-']+$/, {
    message: 'Please use only letters, spaces, hyphens, and apostrophes',
  });

const handleLocalRequest = async (
  email: string,
  name: string,
  SPREADSHEET_ID: string,
  SERVICE_ACCOUNT_EMAIL: string,
  PRIVATE_KEY: string,
): Promise<JoinWaitlistResponse> => {
  if (!GoogleSpreadsheet || !JWT) {
    throw new Error('Google Spreadsheet libraries not loaded');
  }

  const serviceAccountAuth = new JWT({
    email: SERVICE_ACCOUNT_EMAIL,
    key: PRIVATE_KEY,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);

  await doc.loadInfo();

  const sheet = doc.sheetsByIndex[0];

  const rows = await sheet?.getRows();

  const emailExists = rows?.some((row) => row.get('Email') === email);

  if (emailExists) {
    return { exists: true };
  }

  await sheet?.addRow({ Email: email, Name: name });

  return { exists: false };
};

const handleCloudflareRequest = async (
  email: string,
  name: string,
  SPREADSHEET_ID: string,
  SERVICE_ACCOUNT_EMAIL: string,
  PRIVATE_KEY: string,
): Promise<JoinWaitlistResponse> => {
  if (!PRIVATE_KEY || !SERVICE_ACCOUNT_EMAIL || !SPREADSHEET_ID) {
    throw new Error('Missing required environment variables');
  }

  const cleanedKey = PRIVATE_KEY.replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/"/g, '')
    .replace(/'/g, '')
    .replace(/\s/g, '')
    .replace(/\n/g, '')
    .replace(/\r/g, '')
    .trim();

  let keyBuffer: ArrayBuffer;

  try {
    keyBuffer = str2ab(atob(cleanedKey));
  } catch (e) {
    throw new Error(
      'Invalid private key format. Please check the GOOGLE_PRIVATE_KEY environment variable.',
    );
  }

  const key = await crypto.subtle.importKey(
    'pkcs8',
    keyBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const header = b64(JSON.stringify({ typ: 'JWT', alg: 'RS256' }));
  const payload = b64(
    JSON.stringify({
      aud: 'https://www.googleapis.com/oauth2/v4/token',
      iat: Math.floor(Date.now() / 1000) - 10,
      exp: Math.floor(Date.now() / 1000) + 600,
      iss: SERVICE_ACCOUNT_EMAIL,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
    }),
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  const jwt = `${header}.${payload}.${b64(new Uint8Array(signature))}`;

  const tokenResponse = await fetch('https://www.googleapis.com/oauth2/v4/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  const tokenData = await tokenResponse.json();

  if (!tokenResponse.ok || !tokenData.access_token) {
    throw new Error(`Authentication failed: ${JSON.stringify(tokenData)}`);
  }

  const { access_token } = tokenData;

  const getResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/Sheet1!A:B`,
    { headers: { authorization: `Bearer ${access_token}` } },
  );

  const getData = await getResponse.json();

  const { values = [] } = getData;

  const emails = values.slice(1).flat();
  const emailExists = emails.includes(email);

  if (emailExists) {
    return { exists: true };
  }

  const appendResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/Sheet1!A:append?valueInputOption=RAW`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${access_token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ values: [[email, name]] }),
    },
  );

  if (!appendResponse.ok) {
    const errorData = await appendResponse.json();
    throw new Error(`Failed to add email to spreadsheet: ${JSON.stringify(errorData)}`);
  }

  return { exists: false };
};

export const server = {
  joinWaitlist: defineAction({
    accept: 'form',
    input: z.object({
      name: nameSchema,
      email: z
        .string({
          required_error: 'Please enter your email address',
          invalid_type_error: 'Please enter your email address',
        })
        .min(1, { message: 'Please enter your email address' })
        .email({ message: 'Please enter a valid email address' })
        .min(5, { message: 'Email address is too short' })
        .max(255, { message: 'Email address is too long (maximum 255 characters)' })
        .trim()
        .toLowerCase(),
    }),
    handler: async (input, context) => {
      try {
        const SPREADSHEET_ID =
          context.locals.runtime?.env?.GOOGLE_SHEET_ID || import.meta.env.GOOGLE_SHEET_ID;
        const SERVICE_ACCOUNT_EMAIL =
          context.locals.runtime?.env?.GOOGLE_SERVICE_ACCOUNT_EMAIL ||
          import.meta.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
        let PRIVATE_KEY =
          context.locals.runtime?.env?.GOOGLE_PRIVATE_KEY ||
          import.meta.env.GOOGLE_PRIVATE_KEY;

        if (PRIVATE_KEY && PRIVATE_KEY.includes('\\n')) {
          PRIVATE_KEY = PRIVATE_KEY.replace(/\\n/g, '\n');
        }

        const { email, name } = input;

        const isLocal = import.meta.env.DEV;

        const { exists } = isLocal
          ? await handleLocalRequest(
              email,
              name,
              SPREADSHEET_ID,
              SERVICE_ACCOUNT_EMAIL,
              PRIVATE_KEY,
            )
          : await handleCloudflareRequest(
              email,
              name,
              SPREADSHEET_ID,
              SERVICE_ACCOUNT_EMAIL,
              PRIVATE_KEY,
            );

        if (exists) {
          throw new ActionError({
            code: 'CONFLICT',
            message: 'This email is already on the waitlist.',
          });
        }

        return { message: 'Thanks for joining the waitlist!' };
      } catch (error: unknown) {
        if (error instanceof ActionError) {
          throw error;
        }

        throw new ActionError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Something went wrong. Please try again later.',
        });
      }
    },
  }),
};
