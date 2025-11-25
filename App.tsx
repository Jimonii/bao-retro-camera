import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, X } from 'lucide-react';
import { generateCaption } from './services/geminiService.ts';
import { Polaroid } from './components/Polaroid.tsx';
import { PhotoData, Position } from './types.ts';

// Constants for Camera Layout
const CAMERA_SIZE = 450;
const PHOTO_WIDTH = 240;
const PHOTO_HEIGHT = 320;

export default function App() {
  const [photos, setPhotos] = useState<PhotoData[]>([]);
  const [stagedPhoto, setStagedPhoto] = useState<PhotoData | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [dragState, setDragState] = useState<{
    id: string;
    startX: number;
    startY: number;
    initialPhotoPos: Position;
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraContainerRef = useRef<HTMLDivElement>(null);
  const shutterAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    shutterAudioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2578/2578-preview.mp3');
  }, []);

  // --- 1. Camera Setup ---
  useEffect(() => {
    let stream: MediaStream | null = null;
    const startCamera = async () => {
      setCameraError(null);
      try {
        // Try ideal constraints first (User facing, square-ish preference)
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 640 } 
          } 
        });
      } catch (err) {
        console.warn("Preferred camera constraints failed, trying fallback...", err);
        try {
          // Fallback: Accept any camera available
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
        } catch (finalErr) {
          console.error("Camera access failed completely:", finalErr);
          setCameraError("Camera not found.");
        }
      }

      if (stream && videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    };
    startCamera();
    return () => {
      if (stream) stream.getTracks().forEach(track => track.stop());
    };
  }, []);

  // --- 2. Shutter Action ---
  const takePhoto = async () => {
    if (!videoRef.current || stagedPhoto || cameraError) return; // Prevent shot if error or ejecting

    // Play Sound
    if (shutterAudioRef.current) {
      shutterAudioRef.current.currentTime = 0;
      shutterAudioRef.current.play().catch(e => console.warn(e));
    }

    // Capture Image
    const canvas = document.createElement('canvas');
    // The video is 1:1 in CSS, but the source stream might be 4:3. We crop to center square.
    const vid = videoRef.current;
    if (vid.videoWidth === 0 || vid.videoHeight === 0) return;

    const size = Math.min(vid.videoWidth, vid.videoHeight);
    canvas.width = size;
    canvas.height = size;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Draw center crop
      const sx = (vid.videoWidth - size) / 2;
      const sy = (vid.videoHeight - size) / 2;
      
      // Horizontal flip for mirror effect
      ctx.translate(size, 0);
      ctx.scale(-1, 1);
      
      ctx.drawImage(vid, sx, sy, size, size, 0, 0, size, size);
      
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      
      const newId = Date.now().toString();
      const dateStr = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

      // Create Staged Photo (Ejecting state)
      const newPhoto: PhotoData = {
        id: newId,
        dataUrl: dataUrl,
        caption: "",
        date: dateStr,
        position: { x: 0, y: 0 }, // Relative to camera container initially
        zIndex: 10,
        isDeveloping: true,
        isLoadingCaption: true,
      };

      setStagedPhoto(newPhoto);

      // Trigger AI
      generateCaption(dataUrl).then(caption => {
        // Update either staged or wall photo depending on where it is now
        const updateFn = (p: PhotoData) => p.id === newId ? { ...p, caption, isLoadingCaption: false } : p;
        
        setStagedPhoto(prev => prev && prev.id === newId ? updateFn(prev) : prev);
        setPhotos(prev => prev.map(updateFn));
      });

      // Developing effect timer
      setTimeout(() => {
        const clearDevFn = (p: PhotoData) => p.id === newId ? { ...p, isDeveloping: false } : p;
        setStagedPhoto(prev => prev && prev.id === newId ? clearDevFn(prev) : prev);
        setPhotos(prev => prev.map(clearDevFn));
      }, 3500);
    }
  };

  // --- 3. Drag Logic ---

  // A. Start dragging from STAGED (Pulling out of camera)
  const handleStagedMouseDown = (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent default drag
    if (!stagedPhoto || !cameraContainerRef.current) return;

    const rect = cameraContainerRef.current.getBoundingClientRect();
    
    // Calculate where the photo is currently visually on screen
    // It's transformed translateY(-40%) relative to container top.
    // Container is 450px high. Photo is 320px high.
    // Origin is left: 50%, top: 0 inside container.
    // TranslateY(-40%) of photo height (320 * 0.4 = 128px up).
    
    // Actually, let's just grab the mouse position and spawn the wall photo centered on mouse for simplicity, 
    // or offset by click. Let's do offset.
    
    // Current visual center of the ejected photo relative to window:
    // Container Left + 50% width.
    // Container Top - (Photo Height * 0.4).
    
    const photoCenterX = rect.left + (rect.width / 2);
    const photoCenterY = rect.top - (PHOTO_HEIGHT * 0.25); // Approximate visual top

    // Promote to Wall Photo immediately
    const wallPhoto: PhotoData = {
      ...stagedPhoto,
      position: {
        x: photoCenterX - (PHOTO_WIDTH / 2),
        y: photoCenterY
      },
      zIndex: 100 // Top on drag
    };

    setStagedPhoto(null); // Remove from camera
    setPhotos(prev => [...prev, wallPhoto]);
    
    // Start dragging this new wall photo immediately
    setDragState({
      id: wallPhoto.id,
      startX: e.clientX,
      startY: e.clientY,
      initialPhotoPos: wallPhoto.position
    });
  };

  // B. Start dragging generic Wall Photo
  const handleWallMouseDown = (e: React.MouseEvent, photo: PhotoData) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Bring to front
    const maxZ = Math.max(...photos.map(p => p.zIndex), 100) + 1;
    setPhotos(prev => prev.map(p => p.id === photo.id ? { ...p, zIndex: maxZ } : p));

    setDragState({
      id: photo.id,
      startX: e.clientX,
      startY: e.clientY,
      initialPhotoPos: photo.position
    });
  };

  // C. Global Move
  const handleGlobalMouseMove = useCallback((e: MouseEvent) => {
    if (!dragState) return;

    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;

    setPhotos(prev => prev.map(p => {
      if (p.id === dragState.id) {
        return {
          ...p,
          position: {
            x: dragState.initialPhotoPos.x + dx,
            y: dragState.initialPhotoPos.y + dy
          }
        };
      }
      return p;
    }));
  }, [dragState]);

  // D. Global Up
  const handleGlobalMouseUp = useCallback(() => {
    setDragState(null);
  }, []);

  useEffect(() => {
    if (dragState) {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
    } else {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [dragState, handleGlobalMouseMove, handleGlobalMouseUp]);


  // --- 4. Render Helpers ---
  const updatePhoto = (id: string, updates: Partial<PhotoData>) => {
    setPhotos(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  };
  
  const deletePhoto = (id: string) => {
    setPhotos(prev => prev.filter(p => p.id !== id));
  };

  return (
    <div className="w-full h-screen relative overflow-hidden bg-stone-100 select-none">
      
      {/* Title */}
      <h1 className="absolute top-6 left-1/2 transform -translate-x-1/2 text-5xl text-stone-800 font-bold z-0 opacity-20 pointer-events-none">
        Bao Retro Camera
      </h1>

      {/* Instructions */}
      <div className="absolute bottom-4 right-6 text-right text-stone-500 text-lg opacity-60 pointer-events-none z-0">
        <p>1. Click shutter to take photo</p>
        <p>2. Drag photo from slot to wall</p>
        <p>3. Edit text or use AI</p>
      </div>

      {/* --- Photo Wall --- */}
      {photos.map(photo => (
        <Polaroid
          key={photo.id}
          photo={photo}
          onUpdate={updatePhoto}
          onDelete={deletePhoto}
          onMouseDown={(e) => handleWallMouseDown(e, photo)}
          style={{
            transform: `translate(${photo.position.x}px, ${photo.position.y}px) rotate(${ (parseInt(photo.id) % 10) - 5 }deg)`,
            zIndex: photo.zIndex,
            cursor: 'grab'
          }}
          className={dragState?.id === photo.id ? 'cursor-grabbing shadow-2xl scale-105 transition-transform duration-75' : 'shadow-xl hover:scale-105 hover:shadow-2xl transition-all duration-200'}
        />
      ))}

      {/* --- Retro Camera Container --- */}
      <div 
        ref={cameraContainerRef}
        className="fixed z-20"
        style={{
          bottom: '64px',
          left: '64px',
          width: `${CAMERA_SIZE}px`,
          height: `${CAMERA_SIZE}px`,
        }}
      >
        {/* Layer 1: Ejecting Photo (Behind Viewfinder/Body visually, but emerging) */}
        {/* Note: To make it appear "inside" initially, we use z-index relative to camera parts. */}
        {/* We cheat: The "Camera Body" is z-20. The Photo is z-10. The Photo moves up. */}
        {stagedPhoto && (
          <div 
             className="absolute left-1/2 w-[240px] h-[320px] transition-transform duration-[1500ms] ease-out"
             style={{
               top: 0,
               zIndex: 10, // Behind camera body (which is effectively the container + bg)
               // Start at top:0 (hidden behind body), animate to -40% (sticking out top)
               transform: 'translateX(-50%) translateY(-40%)', 
               // Initial state for animation would be translateY(0), but React renders final state.
               // We need a small delay or CSS keyframe. Let's use an inline animation trick or simply CSS transition from mount.
               animation: 'eject 1.5s ease-out forwards'
             }}
             onMouseDown={handleStagedMouseDown}
          >
             <style>{`
               @keyframes eject {
                 from { transform: translateX(-50%) translateY(0); }
                 to { transform: translateX(-50%) translateY(-40%); }
               }
             `}</style>
             <Polaroid 
                photo={stagedPhoto} 
                onUpdate={() => {}} // No updates while staged
                isStaged={true}
             />
          </div>
        )}

        {/* Layer 2: Camera Body Image */}
        <img 
          src="https://s.baoyu.io/images/retro-camera.webp" 
          alt="Retro Camera"
          className="absolute bottom-0 left-0 w-full h-full object-contain z-20 pointer-events-none select-none"
        />

        {/* Layer 3: Viewfinder Video */}
        <div 
          className="absolute overflow-hidden z-30 bg-black flex items-center justify-center"
          style={{
            bottom: '32%',
            left: '62%',
            transform: 'translateX(-50%)',
            width: '27%',
            height: '27%',
            borderRadius: '50%',
            boxShadow: 'inset 0 0 20px rgba(0,0,0,0.8)'
          }}
        >
          {cameraError ? (
            <div className="flex flex-col items-center justify-center text-center p-4">
              <span className="text-white text-xs font-hand opacity-80">{cameraError}</span>
            </div>
          ) : (
            <>
              <video 
                ref={videoRef}
                autoPlay 
                playsInline 
                muted
                className="w-full h-full object-cover transform scale-x-[-1]" // Mirror
              />
              {/* Glare effect */}
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent pointer-events-none rounded-full"></div>
            </>
          )}
        </div>

        {/* Layer 4: Shutter Button (Invisible Click Area) */}
        <div 
          onClick={takePhoto}
          className={`absolute z-30 transition-colors active:scale-95 ${cameraError ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-white/10'}`}
          style={{
            bottom: '40%',
            left: '18%',
            width: '11%',
            height: '11%',
          }}
          title={cameraError ? "Camera unavailable" : "Take Photo"}
        />

        {/* Flash overlay (optional visual feedback) */}
        <div 
           id="flash" 
           className="fixed inset-0 bg-white opacity-0 pointer-events-none z-50 transition-opacity duration-100"
           style={{ pointerEvents: 'none' }}
        ></div>
        
      </div>
    </div>
  );
}