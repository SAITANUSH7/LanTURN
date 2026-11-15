import { apiClient, unwrap } from '../lib/apiClient.js';

/**
 * Full 3-step upload flow:
 * 1. Sign — get a pre-authorized upload URL from backend
 * 2. PUT — upload file directly to Firebase Storage URL with progress tracking
 * 3. Commit — tell backend to persist the URL onto the user profile
 */
export const uploadService = {
  signUpload: (body) => apiClient.post('/uploads/sign', body).then(unwrap),
  commitUpload: (body) => apiClient.post('/uploads/commit', body).then(unwrap),

  /**
   * Upload a file with progress tracking.
   * @param {File} file - The file to upload
   * @param {'resume'|'profilePhoto'|'companyLogo'} kind - Upload kind
   * @param {(pct: number) => void} onProgress - Progress callback (0-100)
   * @returns {Promise<{ url: string, attachedTo: string }>}
   */
  async uploadFile(file, kind, onProgress) {
    // Step 1: Get signed upload URL and token
    const { uploadUrl, token, objectPath } = await uploadService.signUpload({
      kind,
      mimeType: file.type,
      sizeBytes: file.size,
    });

    // Step 2: Upload directly to Storage with XHR for progress tracking
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl, true);
      xhr.setRequestHeader('Content-Type', file.type);
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
      xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));

      xhr.send(file);
    });

    // Step 3: Commit — persist the URL on the profile
    return uploadService.commitUpload({ kind, objectPath, fileName: file.name });
  },
};