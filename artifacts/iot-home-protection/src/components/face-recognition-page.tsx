import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { AlertTriangle, Camera, CheckCircle2, Clock3, FileImage, ImagePlus, RotateCcw, ShieldCheck, ShieldQuestion, Trash2, Upload, X } from 'lucide-react';
import './face-recognition-page.css';

export type FaceRecognitionResult = {
  status: 'authorized' | 'unauthorized' | 'unverified';
  source: 'service' | 'demo';
  reason: string;
  subjectLabel?: string;
  confidence?: number;
};

export type RecentSecurityAlert = {
  id: string;
  severity: 'Critical' | 'High' | 'Medium';
  title: string;
  description: string;
  time: string;
  resolved: boolean;
};

type FaceRecognitionPageProps = {
  demoMode: boolean;
  alerts: RecentSecurityAlert[];
  onAnalyze: (image: File, demoOutcome: FaceRecognitionResult['status']) => Promise<FaceRecognitionResult>;
  onUnauthorized: (result: FaceRecognitionResult) => void;
};

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const SUPPORTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const statusCopy: Record<FaceRecognitionResult['status'], { title: string; detail: string }> = {
  authorized: { title: 'Authorized', detail: 'This sample result indicates a recognized household member.' },
  unauthorized: { title: 'Access not authorized', detail: 'Do not grant entry based on this result. Confirm identity using another trusted method.' },
  unverified: { title: 'Unable to verify', detail: 'No identity match could be confirmed. Use another trusted method before granting entry.' },
};

export function FaceRecognitionPage({ demoMode, alerts, onAnalyze, onUnauthorized }: FaceRecognitionPageProps) {
  const [image, setImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [demoOutcome, setDemoOutcome] = useState<FaceRecognitionResult['status']>('unverified');
  const [result, setResult] = useState<FaceRecognitionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef('');
  const selectionVersionRef = useRef(0);
  const mountedRef = useRef(true);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    if (!cameraOpen || !videoRef.current || !streamRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    void videoRef.current.play().catch(() => setCameraError('The camera preview could not be started. Check browser permissions and try again.'));
  }, [cameraOpen]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopCamera();
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  const clearSelection = () => {
    selectionVersionRef.current += 1;
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = '';
    setPreviewUrl('');
    setImage(null);
    setResult(null);
  };

  const setSelectedImage = (file: File) => {
    clearSelection();
    setError('');
    if (!SUPPORTED_TYPES.has(file.type)) {
      setError('Choose a JPEG, PNG, WebP, or GIF image.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError('This image is larger than 10 MB. Choose a smaller file.');
      return;
    }
    const selectionVersion = selectionVersionRef.current;
    const url = URL.createObjectURL(file);
    const decodedImage = new Image();
    decodedImage.onload = () => {
      if (selectionVersion !== selectionVersionRef.current || !mountedRef.current) {
        URL.revokeObjectURL(url);
        return;
      }
      if (!decodedImage.naturalWidth || !decodedImage.naturalHeight) {
        URL.revokeObjectURL(url);
        setError('This image could not be decoded. Try a different image.');
        return;
      }
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      previewRef.current = url;
      setPreviewUrl(url);
      setImage(file);
      setResult(null);
      setError('');
    };
    decodedImage.onerror = () => {
      URL.revokeObjectURL(url);
      if (selectionVersion === selectionVersionRef.current && mountedRef.current) {
        setError('This image could not be decoded. Try a different image.');
      }
    };
    decodedImage.src = url;
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file) setSelectedImage(file);
  };

  const openCamera = async () => {
    setCameraError('');
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera access is not available in this browser. Upload an image instead.');
      return;
    }
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      if (!mountedRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      streamRef.current = stream;
      setCameraOpen(true);
    } catch {
      stopCamera();
      setCameraError('Camera access was not granted. You can upload an image instead.');
    }
  };

  const captureImage = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setCameraError('The camera is not ready yet. Wait a moment and try again.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      setCameraError('A still image could not be captured. Upload an image instead.');
      return;
    }
    context.drawImage(video, 0, 0);
    canvas.toBlob(blob => {
      if (!blob) {
        setCameraError('A still image could not be captured. Please try again.');
        return;
      }
      const captured = new File([blob], `hearthguard-capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
      stopCamera();
      setCameraOpen(false);
      setSelectedImage(captured);
    }, 'image/jpeg', 0.92);
  };

  const removeImage = () => {
    stopCamera();
    setCameraOpen(false);
    clearSelection();
    setError('');
    setCameraError('');
  };

  const retakeImage = () => {
    removeImage();
    void openCamera();
  };

  const analyzeImage = async () => {
    if (!image || busy) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const response = await onAnalyze(image, demoOutcome);
      setResult(response);
      if (response.status === 'unauthorized') onUnauthorized(response);
    } catch {
      setResult({
        status: 'unverified',
        source: demoMode ? 'demo' : 'service',
        reason: 'The verification request could not be completed. Treat this image as unverified and confirm identity another way.',
      });
    } finally {
      setBusy(false);
    }
  };

  const visibleAlerts = alerts.slice(0, 3);
  const resultStatus = result?.status;

  return (
    <section className="face-page" aria-labelledby="face-page-title">
      <header className="face-page__welcome">
        <div>
          <div className="face-page__eyebrow"><span /> ENTRY REVIEW <span className="face-page__demo-tag">SAMPLE HOME</span></div>
          <h1 id="face-page-title">Face <em>recognition.</em></h1>
          <p>Review an image for this sample home. This tool does not monitor your home or grant access.</p>
        </div>
        <div className="face-page__header-mark" aria-hidden="true"><ShieldCheck size={20} /><span>LOCAL REVIEW</span></div>
      </header>

      <div className="face-page__notice" role="note" data-testid="info-face-demo">
        <ShieldQuestion size={17} />
        {demoMode
          ? <p><strong>Demo mode.</strong> No recognition service is connected. Images stay in this browser and are not analysed, uploaded, or used to identify people.</p>
          : <p><strong>Recognition endpoint configured.</strong> The selected image is sent to that service only when you choose Analyze. This page does not monitor real Wi-Fi or control a door lock.</p>}
      </div>

      <div className="face-page__grid">
        <section className="face-page__panel face-page__review" aria-labelledby="face-review-heading">
          <div className="face-page__panel-heading">
            <div><span className="face-page__kicker">IMAGE REVIEW</span><h2 id="face-review-heading">Review an image</h2></div>
            <span className="face-page__step">01 / 02</span>
          </div>
          <p className="face-page__intro">Choose a still image or capture one with your camera. Images must be 10 MB or smaller.</p>

          {!previewUrl && !cameraOpen && <div className="face-page__dropzone" data-testid="dropzone-face-image">
            <div className="face-page__upload-mark"><ImagePlus size={20} /></div>
            <strong>Start with a still image</strong>
            <span>JPEG, PNG, WebP, or GIF · up to 10 MB</span>
            <div className="face-page__source-actions">
              <button type="button" className="face-page__button face-page__button--primary" onClick={() => fileInputRef.current?.click()} data-testid="button-upload-image"><Upload size={14} /> Choose image</button>
              <button type="button" className="face-page__button face-page__button--quiet" onClick={openCamera} data-testid="button-open-camera"><Camera size={15} /> Use camera</button>
            </div>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleFileChange} hidden data-testid="input-face-image" aria-label="Choose an image to review" />
          </div>}

          {cameraOpen && <div className="face-page__camera" data-testid="camera-preview">
            <video ref={videoRef} autoPlay playsInline muted aria-label="Camera preview" />
            <div className="face-page__camera-actions">
              <button type="button" className="face-page__button face-page__button--primary" onClick={captureImage} data-testid="button-capture-image"><Camera size={14} /> Capture image</button>
              <button type="button" className="face-page__button face-page__button--quiet" onClick={() => { stopCamera(); setCameraOpen(false); setCameraError(''); }} data-testid="button-close-camera"><X size={14} /> Close camera</button>
            </div>
          </div>}

          {previewUrl && image && <div className="face-page__preview" data-testid="preview-face-image">
            <div className="face-page__preview-image"><img src={previewUrl} alt="Selected image for review" /></div>
            <div className="face-page__file-meta"><span className="face-page__file-icon"><FileImage size={15} /></span><div><strong>{image.name}</strong><span>{(image.size / (1024 * 1024)).toFixed(2)} MB · image selected</span></div></div>
            <div className="face-page__preview-actions">
              <button type="button" className="face-page__button face-page__button--quiet" onClick={retakeImage} data-testid="button-retake-image"><RotateCcw size={14} /> Retake</button>
              <button type="button" className="face-page__button face-page__button--remove" onClick={removeImage} data-testid="button-remove-image"><Trash2 size={14} /> Remove</button>
            </div>
          </div>}

          {error && <p className="face-page__inline-error" role="alert" data-testid="text-face-image-error">{error}</p>}
          {cameraError && <p className="face-page__inline-error" role="alert" data-testid="text-face-camera-error">{cameraError}</p>}

          {demoMode && <div className="face-page__demo-controls">
            <label htmlFor="demo-outcome">Preview a result</label>
            <select id="demo-outcome" value={demoOutcome} onChange={event => setDemoOutcome(event.target.value as FaceRecognitionResult['status'])} data-testid="select-demo-outcome">
              <option value="unverified">Unverified</option>
              <option value="authorized">Authorized</option>
              <option value="unauthorized">Unauthorized</option>
            </select>
            <p>This demo-only choice does not inspect or match the image. It only previews the result display.</p>
          </div>}

          <button type="button" className="face-page__analyze" onClick={analyzeImage} disabled={!image || busy} data-testid="button-analyze-image">
            {busy ? <><span className="face-page__loading-mark" /> Reviewing sample image</> : <><ShieldCheck size={15} /> Analyze image</>}
          </button>
        </section>

        <section className="face-page__panel face-page__result-panel" aria-labelledby="face-result-heading">
          <div className="face-page__panel-heading">
            <div><span className="face-page__kicker">REVIEW OUTCOME</span><h2 id="face-result-heading">Verification result</h2></div>
            <span className="face-page__step">02 / 02</span>
          </div>
          {!result && <div className="face-page__result-empty" data-testid="status-face-result-empty">
            <div className="face-page__result-icon"><ShieldQuestion size={19} /></div>
            <strong>Nothing reviewed yet</strong>
            <span>Your result will appear here after image review.</span>
          </div>}
          {result && <div className={`face-page__result face-page__result--${resultStatus}`} role={result.status === 'unauthorized' ? 'alert' : 'status'} data-testid={`status-face-result-${result.status}`}>
            <div className="face-page__result-title">
              <span className="face-page__result-icon">{result.status === 'authorized' ? <CheckCircle2 size={19} /> : result.status === 'unauthorized' ? <AlertTriangle size={19} /> : <ShieldQuestion size={19} />}</span>
              <div><span className="face-page__kicker">RESULT</span><h3>{statusCopy[result.status].title}</h3></div>
            </div>
            <p className="face-page__result-reason">{result.reason || statusCopy[result.status].detail}</p>
            {result.subjectLabel && <div className="face-page__result-detail"><span>SUBJECT</span><strong>{result.subjectLabel}</strong></div>}
            {typeof result.confidence === 'number' && <div className="face-page__result-detail"><span>CONFIDENCE</span><strong>{Math.round(result.confidence * 100)}%</strong></div>}
            <div className="face-page__result-source">{result.source === 'demo' ? 'Demo-only preview' : 'Service response'} · Not a door access decision</div>
          </div>}
        </section>
      </div>

      <section className="face-page__panel face-page__alerts" aria-labelledby="face-alerts-heading">
        <div className="face-page__panel-heading">
          <div><span className="face-page__kicker">HOME ACTIVITY</span><h2 id="face-alerts-heading">Recent security alerts <span className="face-page__count">{visibleAlerts.length}</span></h2></div>
          <span className="face-page__alerts-caption"><Clock3 size={13} /> From the sample timeline</span>
        </div>
        {visibleAlerts.length ? <div className="face-page__alert-list" data-testid="list-recent-security-alerts">
          {visibleAlerts.map(alert => <article key={alert.id} className={`face-page__alert face-page__alert--${alert.severity.toLowerCase()} ${alert.resolved ? 'is-resolved' : ''}`} data-testid={`card-security-alert-${alert.id}`}>
            <span className="face-page__alert-rail" />
            <div className="face-page__alert-copy">
              <div className="face-page__alert-meta"><span>{alert.severity} severity</span><time>{alert.time}</time></div>
              <h3>{alert.title}</h3><p>{alert.description}</p>
            </div>
            <span className={`face-page__alert-state ${alert.resolved ? 'is-resolved' : ''}`} data-testid={`status-security-alert-${alert.id}`}>{alert.resolved ? 'Resolved' : 'Open'}</span>
          </article>)}
        </div> : <div className="face-page__alerts-empty" data-testid="status-no-security-alerts">No recent sample alerts to show.</div>}
        <p className="face-page__alerts-footnote">Demo-only content. These fictional events are not live monitoring data.</p>
      </section>
      <footer className="face-page__footer"><ShieldCheck size={15} /><span><strong>{demoMode ? 'Simulation only.' : 'Review only.'}</strong> No real Wi-Fi is monitored and no result controls entry to your home.</span></footer>
    </section>
  );
}
