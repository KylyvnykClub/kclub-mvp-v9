import { avatarObjectKey } from "@/lib/avatar-path";
import { getObjectStorage } from "./r2-client";

export { avatarObjectKey } from "@/lib/avatar-path";

export const AVATAR_CONTENT_TYPE = "image/webp";

export async function putAvatar(
  memberId: string,
  webpBytes: Buffer,
): Promise<void> {
  await getObjectStorage().putObject(
    avatarObjectKey(memberId),
    webpBytes,
    AVATAR_CONTENT_TYPE,
  );
}

export async function getAvatar(memberId: string): Promise<Buffer | null> {
  return getObjectStorage().getObject(avatarObjectKey(memberId));
}

export async function deleteAvatar(memberId: string): Promise<void> {
  await getObjectStorage().deleteObject(avatarObjectKey(memberId));
}
