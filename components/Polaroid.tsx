import React, { useState, useRef, useEffect } from 'react';
import { Pencil, RotateCw, Download, Trash2, X, Check } from 'lucide-react';
import { PhotoData } from '../types.ts';
import { generateCaption } from '../services/geminiService.ts';

interface PolaroidProps {
  photo: PhotoData;
  onUpdate: (id: string, updates: Partial<PhotoData>) => void;
  onDelete?: (id: string) => void;
  onMouseDown?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
  className?: string;
  isStaged?: boolean; // If true, it's inside the camera (non-interactive mostly)
}

export const Polaroid: React.FC<PolaroidProps> = ({
  photo,
  onUpdate,
  onDelete,
  onMouseDown,
  style,
  className = '',
  isStaged = false
}) => {
  const [isHovering, setIsHovering] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(photo.caption);
  const cardRef = useRef<HTMLDivElement>(null);

  // Sync state if prop changes (e.g. from AI generation)
  useEffect(() => {
    setEditText(photo.caption);
  }, [photo.caption]);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!cardRef.current || !window.html2canvas) return;

    try {
      // Temporarily hide the tools for screenshot
      const tools = cardRef.current.querySelector('.photo-tools');
      if (tools) (tools as HTMLElement).style.display = 'none';

      const canvas = await window.html2canvas(cardRef.current, {
        scale: 2, // High res
        backgroundColor: null,
      });

      // Restore tools
      if (tools) (tools as HTMLElement).style.display = '';

      const link = document.createElement('a');
      link.download = `polaroid-${photo.id}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error("Download failed", err);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete) onDelete(photo.id);
  };

  const handleRegenerate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    onUpdate(photo.id, { isLoadingCaption: true });
    const newCaption = await generateCaption(photo.dataUrl);
    onUpdate(photo.id, { caption: newCaption, isLoadingCaption: false });
  };

  const saveEdit = () => {
    onUpdate(photo.id, { caption: editText });
    setIsEditing(false);
  };

  const cancelEdit = () => {
    setEditText(photo.caption);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      cancelEdit();
    }
  };

  // Prevent drag propagation when interacting with inputs or buttons
  const stopProp = (e: React.PointerEvent | React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      ref={cardRef}
      className={`absolute flex flex-col items-center bg-white shadow-xl ${className} ${photo.isDeveloping ? 'brightness-110' : ''}`}
      style={{
        width: '240px',
        height: '320px', // 3:4 aspect ratio roughly
        padding: '16px 16px 40px 16px', // Thick bottom like polaroid
        transition: isStaged ? 'filter 3s ease-out' : 'transform 0.1s',
        cursor: isStaged ? 'grab' : 'default', // If staged, grab to pull out. If wall, handled by parent
        ...style
      }}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onMouseDown={onMouseDown}
    >
      {/* Top Controls (Only on wall, not staged) */}
      {!isStaged && isHovering && !isEditing && (
        <div 
          className="photo-tools absolute -top-4 left-1/2 transform -translate-x-1/2 flex gap-2 bg-gray-800 text-white px-3 py-1 rounded-full text-xs shadow-lg z-50 transition-opacity"
          onMouseDown={stopProp} // Prevent dragging when clicking tools
        >
          <button onClick={handleDownload} className="hover:text-blue-300 transition-colors" title="Download">
            <Download size={14} />
          </button>
          <button onClick={handleDelete} className="hover:text-red-300 transition-colors" title="Delete">
            <Trash2 size={14} />
          </button>
        </div>
      )}

      {/* Image Area */}
      <div className="w-full h-[200px] bg-gray-900 mb-4 overflow-hidden relative border border-gray-100">
         <img
          src={photo.dataUrl}
          alt="Memory"
          draggable={false}
          className="w-full h-full object-cover"
          style={{
            filter: photo.isDeveloping ? 'blur(8px) brightness(1.5) grayscale(0.5)' : 'none',
            transition: 'filter 3s ease-in-out',
          }}
        />
        {/* Paper texture overlay for realism */}
        <div className="absolute inset-0 pointer-events-none opacity-10 bg-[url('https://www.transparenttextures.com/patterns/paper-fibers.png')]"></div>
      </div>

      {/* Caption Area */}
      <div 
        className="w-full flex-1 flex flex-col justify-start items-center relative group"
        onMouseDown={!isEditing ? undefined : stopProp}
      >
        <div className="text-gray-400 text-[10px] self-end w-full text-right font-sans mb-1 pr-1">
          {photo.date}
        </div>

        {isEditing ? (
          <div className="w-full relative h-full">
            <textarea
              className="w-full h-full bg-gray-50 border border-dashed border-gray-300 p-2 text-xl text-gray-700 font-hand resize-none focus:outline-none"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
            />
            <div className="absolute bottom-0 right-0 flex gap-1 bg-white/90 p-1">
               <button onClick={saveEdit} className="text-green-600 hover:bg-green-100 p-1 rounded"><Check size={14}/></button>
               <button onClick={cancelEdit} className="text-red-500 hover:bg-red-100 p-1 rounded"><X size={14}/></button>
            </div>
          </div>
        ) : (
          <div 
            className="w-full text-center relative"
            onDoubleClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
          >
            <p className={`text-xl text-gray-800 leading-6 font-hand min-h-[1.5em] px-1 ${photo.isLoadingCaption ? 'animate-pulse text-gray-400' : ''}`}>
              {photo.isLoadingCaption ? 'Developing thought...' : (photo.caption || '...')}
            </p>

            {/* Hover actions for caption */}
            {!isStaged && isHovering && !photo.isLoadingCaption && (
              <div 
                className="absolute -right-2 top-0 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                onMouseDown={stopProp}
              >
                <button 
                  onClick={() => setIsEditing(true)} 
                  className="p-1 text-gray-400 hover:text-gray-800 bg-white/50 rounded-full"
                  title="Edit Text"
                >
                  <Pencil size={12} />
                </button>
                <button 
                  onClick={handleRegenerate} 
                  className="p-1 text-gray-400 hover:text-blue-600 bg-white/50 rounded-full"
                  title="Regenerate with AI"
                >
                  <RotateCw size={12} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};