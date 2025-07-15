/**
 * Generates SHA-256 hash for a given buffer
 * @param buffer The buffer to hash
 * @returns Promise that resolves to hex string of the hash
 */
export async function sha256(buffer: ArrayBuffer): Promise<string> {
  try {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
  } catch (error) {
    console.error("Error generating hash:", error);
    throw new Error("Failed to generate file hash");
  }
}