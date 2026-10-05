import { supabaseAdmin } from "@/lib/supabase";

const bucket = "closet";

export function itemStorageKey(userId: string, itemId: string) {
  return `${userId}/items/${itemId}.jpg`;
}

export function mannequinStorageKey(userId: string, comboKey: string) {
  const safe = comboKey.replaceAll("|", "-").replaceAll(/[^a-zA-Z0-9_-]/g, "").slice(0, 180);
  return `${userId}/mannequin/${safe}.jpg`;
}

export async function uploadBytes(key: string, bytes: Buffer, contentType = "image/jpeg") {
  const { error } = await supabaseAdmin().storage.from(bucket).upload(key, bytes, {
    contentType,
    upsert: true,
  });
  if (error) {
    throw new Error(error.message);
  }
  return key;
}

export async function downloadBytes(key: string) {
  const { data, error } = await supabaseAdmin().storage.from(bucket).download(key);
  if (error || !data) {
    throw new Error(error?.message ?? "Could not read that photo");
  }
  return Buffer.from(await data.arrayBuffer());
}

/** Cheap existence check, so a page can show a cached render without downloading or generating it. */
export async function objectExists(key: string) {
  const slash = key.lastIndexOf("/");
  const folder = key.slice(0, slash);
  const name = key.slice(slash + 1);
  const { data, error } = await supabaseAdmin().storage.from(bucket).list(folder, { search: name, limit: 5 });
  if (error || !data) return false;
  return data.some((row) => row.name === name);
}

export async function deleteObject(key: string) {
  await supabaseAdmin().storage.from(bucket).remove([key]);
}

export async function signedUrl(key: string, expiresIn = 3600) {
  const { data, error } = await supabaseAdmin().storage.from(bucket).createSignedUrl(key, expiresIn);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Could not sign that photo");
  }
  return data.signedUrl;
}
