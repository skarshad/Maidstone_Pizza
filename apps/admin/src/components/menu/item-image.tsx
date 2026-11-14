'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type ChangeEvent } from 'react';
import { ApiError } from '@mp/api-client';
import { MENU_IMAGE_MAX_BYTES, MENU_IMAGE_TYPES, menuImagePath } from '@mp/validation';
import { browserApi } from '@/lib/api-browser';
import { supabaseBrowser } from '@/lib/supabase-browser';

const BUCKET = 'menu';
const button =
  'inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold ring-1 ring-ink-900/15 hover:bg-cream-200 disabled:opacity-50';

/** Path inside the bucket for a public image URL, or null if it is not one of ours. */
function pathFromUrl(url: string | null): string | null {
  const marker = `/object/public/${BUCKET}/`;
  const index = url?.indexOf(marker) ?? -1;
  return url && index >= 0 ? url.slice(index + marker.length) : null;
}

/**
 * Photo or GIF for one menu item. The file goes straight from the browser to
 * Supabase Storage as the signed-in manager (Storage enforces who may upload,
 * the 5 MB limit and the file types); the API then records which file to show.
 */
export function ItemImage({
  itemId,
  itemName,
  imageUrl,
}: {
  itemId: string;
  itemName: string;
  imageUrl: string | null;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);
  const currentPath = pathFromUrl(imageUrl);

  async function removeFile(path: string | null) {
    // Best effort: an orphaned file is harmless, a failed tidy-up should not fail the save.
    if (path) await supabaseBrowser().storage.from(BUCKET).remove([path]);
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const extension = MENU_IMAGE_TYPES[file.type as keyof typeof MENU_IMAGE_TYPES];
    if (!extension) {
      setMessage({ tone: 'error', text: 'Choose a JPG, PNG, WebP or GIF file.' });
      return;
    }
    if (file.size > MENU_IMAGE_MAX_BYTES) {
      const mb = (file.size / 1024 / 1024).toFixed(1);
      setMessage({ tone: 'error', text: `That file is ${mb} MB. The limit is 5 MB.` });
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      // A new name each time, so browsers never show a stale cached photo.
      const path = menuImagePath(itemId, `photo-${Date.now().toString(36)}`, extension);
      const { error } = await supabaseBrowser()
        .storage.from(BUCKET)
        .upload(path, file, { contentType: file.type, cacheControl: '31536000', upsert: false });
      if (error) throw new Error(error.message);

      await browserApi().admin.setItemImage(itemId, path);
      await removeFile(currentPath);
      setMessage({ tone: 'ok', text: 'Photo saved.' });
      router.refresh();
    } catch (e) {
      setMessage({
        tone: 'error',
        text:
          e instanceof ApiError
            ? e.message
            : `The upload did not work. ${e instanceof Error ? e.message : ''}`.trim(),
      });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setMessage(null);
    try {
      await browserApi().admin.setItemImage(itemId, null);
      await removeFile(currentPath);
      setMessage({ tone: 'ok', text: 'Photo removed.' });
      router.refresh();
    } catch (e) {
      setMessage({
        tone: 'error',
        text: e instanceof ApiError ? e.message : 'Could not remove the photo.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="mt-4 rounded-xl border border-ink-900/10 p-4"
      aria-labelledby="photo-heading"
    >
      <h2 id="photo-heading" className="text-lg">
        Photo
      </h2>
      <div className="mt-3 flex flex-wrap items-start gap-4">
        <div className="flex h-36 w-56 items-center justify-center overflow-hidden rounded-lg bg-cream-200 text-sm text-ink-500">
          {imageUrl ? (
            // Plain img: animated GIFs must not be re-encoded.
            <img
              src={imageUrl}
              alt={`Current photo of ${itemName}`}
              className="h-full w-full object-cover"
            />
          ) : (
            'No photo yet'
          )}
        </div>
        <div className="max-w-sm space-y-2">
          <input
            ref={fileInput}
            type="file"
            accept={Object.keys(MENU_IMAGE_TYPES).join(',')}
            className="sr-only"
            id="photo-file"
            onChange={upload}
            disabled={busy}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={button}
              disabled={busy}
              onClick={() => fileInput.current?.click()}
            >
              {busy ? 'Working…' : imageUrl ? 'Replace photo' : 'Upload a photo or GIF'}
            </button>
            {imageUrl && (
              <button type="button" className={button} disabled={busy} onClick={remove}>
                Remove photo
              </button>
            )}
          </div>
          <p className="text-xs text-ink-500">
            JPG, PNG, WebP or GIF, up to 5 MB. Landscape works best (about 1200 × 800). The photo is
            saved straight away; you do not need to press Save changes. Only use images you own or
            have permission to use.
          </p>
          <p
            role={message?.tone === 'error' ? 'alert' : 'status'}
            className={
              'text-sm font-semibold ' +
              (message?.tone === 'error' ? 'text-red-700' : 'text-green-700')
            }
          >
            {message?.text}
          </p>
        </div>
      </div>
    </section>
  );
}
