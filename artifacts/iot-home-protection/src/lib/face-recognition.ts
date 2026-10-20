import type { FaceRecognitionResult } from '@/components/face-recognition-page';

const recognitionEndpoint = import.meta.env.VITE_FACE_RECOGNITION_ENDPOINT?.trim() ?? '';

export const isFaceRecognitionDemoMode = recognitionEndpoint.length === 0;

type RecognitionStatus = FaceRecognitionResult['status'];

function normalizeStatus(value: unknown): RecognitionStatus | null {
  if (typeof value !== 'string') return null;
  const status = value.trim().toLowerCase().replaceAll(' ', '_');
  if (status === 'authorized' || status === 'unauthorized' || status === 'unverified' || status === 'unable_to_verify') {
    return status === 'unable_to_verify' ? 'unverified' : status;
  }
  return null;
}

function demoResult(status: RecognitionStatus): FaceRecognitionResult {
  const reasons: Record<RecognitionStatus, string> = {
    authorized: 'Demo outcome selected for interface preview only. No face match was performed and this is not an access decision.',
    unauthorized: 'Demo outcome selected for interface preview only. No face match was performed and this is not a real access detection.',
    unverified: 'No recognition service is connected. The image was not analysed, so the result cannot be verified.',
  };

  return {
    status,
    source: 'demo',
    reason: reasons[status],
    ...(status === 'authorized' ? { subjectLabel: 'Demo identity' } : {}),
  };
}

/**
 * Sends the selected image only when a face-recognition endpoint is explicitly configured.
 * Endpoint contract: POST multipart/form-data with an "image" file field; JSON response
 * { status: "authorized" | "unauthorized" | "unverified", reason: string,
 *   subjectLabel?: string, confidence?: number }.
 */
export async function recognizeFace(image: File, demoOutcome: RecognitionStatus): Promise<FaceRecognitionResult> {
  if (isFaceRecognitionDemoMode) {
    return demoResult(demoOutcome);
  }

  try {
    const formData = new FormData();
    formData.append('image', image, image.name || 'face-image');
    const response = await fetch(recognitionEndpoint, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: formData,
      credentials: 'same-origin',
    });

    if (!response.ok) {
      return {
        status: 'unverified',
        source: 'service',
        reason: `The recognition service returned an error (HTTP ${response.status}). No authorization decision was made.`,
      };
    }

    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { status: 'unverified', source: 'service', reason: 'The recognition service returned an invalid response. No authorization decision was made.' };
    }

    const data = payload as Record<string, unknown>;
    const status = normalizeStatus(data.status);
    if (!status || typeof data.reason !== 'string' || !data.reason.trim()) {
      return { status: 'unverified', source: 'service', reason: 'The recognition service response was not understood. No authorization decision was made.' };
    }

    return {
      status,
      source: 'service',
      reason: data.reason.trim(),
      ...(typeof data.subjectLabel === 'string' && data.subjectLabel.trim()
        ? { subjectLabel: data.subjectLabel.trim() }
        : {}),
      ...(typeof data.confidence === 'number' && Number.isFinite(data.confidence) && data.confidence >= 0 && data.confidence <= 1
        ? { confidence: data.confidence }
        : {}),
    };
  } catch {
    return {
      status: 'unverified',
      source: 'service',
      reason: 'The recognition service could not be reached or its response could not be read. No authorization decision was made.',
    };
  }
}
