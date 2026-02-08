import { z } from 'astro/zod';
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

const emailSchema = z.string().email();

// Local request handler
const handleLocalRequest = async (
  email: string,
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

  await sheet?.addRow({ Email: email });

  return { exists: false };
};

// Cloudflare request handler
const handleCloudflareRequest = async (
  email: string,
  SPREADSHEET_ID: string,
  SERVICE_ACCOUNT_EMAIL: string,
  PRIVATE_KEY: string,
): Promise<JoinWaitlistResponse> => {
  if (!PRIVATE_KEY || !SERVICE_ACCOUNT_EMAIL || !SPREADSHEET_ID) {
    throw new Error('Missing required environment variables');
  }

  const cleanedKey = PRIVATE_KEY.replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/"/g, '') // Remove quotes
    .replace(/'/g, '') // Remove single quotes
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
  const jwt = `${header}.${payload}.${b64(signature)}`;

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
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/Sheet1!A:A`,
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
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/Sheet1!A:A:append?valueInputOption=RAW`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${access_token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ values: [[email]] }),
    },
  );

  if (!appendResponse.ok) {
    const errorData = await appendResponse.json();
    throw new Error(`Failed to add email to spreadsheet: ${JSON.stringify(errorData)}`);
  }

  return { exists: false };
};

export const POST = async ({ request, locals }: { request: Request; locals: Locals }) => {
  try {
    const SPREADSHEET_ID =
      locals.runtime?.env?.GOOGLE_SHEET_ID || import.meta.env.GOOGLE_SHEET_ID;
    const SERVICE_ACCOUNT_EMAIL =
      locals.runtime?.env?.GOOGLE_SERVICE_ACCOUNT_EMAIL ||
      import.meta.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    let PRIVATE_KEY =
      locals.runtime?.env?.GOOGLE_PRIVATE_KEY || import.meta.env.GOOGLE_PRIVATE_KEY;

    if (PRIVATE_KEY && PRIVATE_KEY.includes('\\n')) {
      PRIVATE_KEY = PRIVATE_KEY.replace(/\\n/g, '\n');
    }

    const { email } = await request.json();

    const result = emailSchema.safeParse(email);

    if (!result.success) {
      return new Response(
        JSON.stringify({ message: 'Please enter a valid email address.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const isLocal = import.meta.env.DEV;

    const { exists } = isLocal
      ? await handleLocalRequest(
          email,
          SPREADSHEET_ID,
          SERVICE_ACCOUNT_EMAIL,
          PRIVATE_KEY,
        )
      : await handleCloudflareRequest(
          email,
          SPREADSHEET_ID,
          SERVICE_ACCOUNT_EMAIL,
          PRIVATE_KEY,
        );

    if (exists) {
      return new Response(
        JSON.stringify({ message: 'This email is already on the waitlist.' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response(JSON.stringify({ message: 'Thanks for joining the waitlist!' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    return new Response(
      JSON.stringify({
        message: 'Something went wrong. Please try again later.',
        error: error instanceof Error ? error.message : 'Unknown error',
        errorName: error instanceof Error ? error.name : 'Unknown error',
        stack: error instanceof Error ? error.stack : 'Unknown stack',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};
