import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Film,
  GripVertical,
  Play,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import { useCinemaStore } from '../../store/cinemaStore';
import { StepProgressBar } from '../../components/common/StepProgressBar';
import { processUploadedVideoFile } from '../../services/media/videoProcessor';
import { formatDuration, formatFileSize } from '../../utils/formatters';
import { PlaylistItem } from '../../types/cinema';

export const VideoUploadPage: React.FC = () => {
  const {
    selectedTheaterConfig,
    selectedSeat,
    videoMode,
    setVideoMode,
    playlist,
    addPlaylistItems,
    replacePlaylistItem,
    removePlaylistItem,
    reorderPlaylist,
    navigate,
    recoveryNotice,
    dismissRecoveryNotice,
  } = useCinemaStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);

  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [processingLabel, setProcessingLabel] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<PlaylistItem | null>(null);

  // Drag-and-drop playlist item reordering state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  if (!selectedTheaterConfig || !selectedSeat) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center bg-[#070709] p-6 text-center">
        <p className="font-display text-3xl text-[#F4F1EA]">Theater &amp; Seat Required</p>
        <button
          type="button"
          onClick={() => navigate(selectedTheaterConfig ? 'seat_selection' : 'theaters')}
          className="mt-6 rounded-md bg-[#D4AF37] px-6 py-3 text-xs font-semibold uppercase tracking-wider text-[#070709] cursor-pointer"
        >
          {selectedTheaterConfig ? 'Select Seat' : 'Choose Theater'}
        </button>
      </div>
    );
  }

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploadError(null);

    const files = Array.from(fileList);
    if (videoMode === 'without_ads' && files.length > 1) {
      setUploadError(
        'Without Ads mode supports exactly one feature video. Only the first selected file will be loaded, or switch to With Ads mode for a multi-video playlist.',
      );
    }

    const filesToProcess = videoMode === 'without_ads' ? [files[0]] : files;
    const processed: PlaylistItem[] = [];
    const errors: string[] = [];

    try {
      for (let i = 0; i < filesToProcess.length; i++) {
        const file = filesToProcess[i];
        try {
          const item = await processUploadedVideoFile(
            file,
            playlist.length + processed.length,
            (stage) => setProcessingLabel(stage),
          );
          processed.push(item);
        } catch (err) {
          errors.push(
            err instanceof Error ? err.message : `Unable to read "${file.name}".`,
          );
        }
      }

      if (processed.length > 0) {
        addPlaylistItems(processed);
        if (videoMode === 'without_ads') {
          setPreviewItem(processed[0]);
        } else if (!previewItem) {
          setPreviewItem(processed[0]);
        }
      }

      if (errors.length > 0) {
        setUploadError(errors[0]);
      }
    } finally {
      setProcessingLabel(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleReplaceFile = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || !replaceTargetId) return;
    setUploadError(null);
    const file = fileList[0];

    try {
      const targetIndex = playlist.findIndex((p) => p.id === replaceTargetId);
      const item = await processUploadedVideoFile(
        file,
        targetIndex >= 0 ? targetIndex : 0,
        (stage) => setProcessingLabel(stage),
      );
      replacePlaylistItem(replaceTargetId, item);
      if (previewItem?.id === replaceTargetId || videoMode === 'without_ads') {
        setPreviewItem(item);
      }
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : 'Unable to replace with the selected video file.',
      );
    } finally {
      setProcessingLabel(null);
      setReplaceTargetId(null);
      if (replaceInputRef.current) replaceInputRef.current.value = '';
    }
  };

  const triggerReplace = (id: string) => {
    setReplaceTargetId(id);
    replaceInputRef.current?.click();
  };

  const totalDurationSeconds = playlist.reduce((sum, item) => sum + item.duration, 0);
  const totalBytes = playlist.reduce((sum, item) => sum + item.fileSize, 0);
  const activePreview =
    previewItem && playlist.some((p) => p.id === previewItem.id)
      ? previewItem
      : playlist[0] || null;

  return (
    <div className="min-h-[calc(100vh-73px)] bg-[#070709] text-[#F4F1EA]">
      <StepProgressBar />

      <div className="mx-auto max-w-[1440px] px-6 py-10 lg:px-10 lg:py-14">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between border-b border-white/[0.08] pb-6">
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => navigate('seat_selection')}
              className="inline-flex items-center gap-2 text-xs font-medium text-neutral-400 hover:text-[#F4F1EA] cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Change Seat ({selectedSeat.id})</span>
            </button>
            <h1 className="font-display text-3xl sm:text-5xl font-semibold text-[#F4F1EA]">
              Upload Video
            </h1>
          </div>

          <div className="text-xs text-neutral-400 md:text-right space-y-1">
            <p className="text-[#E5C158] font-medium">
              {selectedTheaterConfig.theaterName} · Seat {selectedSeat.id}
            </p>
            <p className="font-mono-tabular">
              {formatDuration(totalDurationSeconds)} · {formatFileSize(totalBytes)}
            </p>
          </div>
        </div>

        {/* Recovery Notice after browser refresh if blobs were purged */}
        {recoveryNotice && (
          <div className="mt-6 flex items-start justify-between gap-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
              <p>{recoveryNotice}</p>
            </div>
            <button
              type="button"
              onClick={dismissRecoveryNotice}
              className="text-xs underline hover:text-white cursor-pointer shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Mode Selector */}
        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
          <button
            type="button"
            onClick={() => setVideoMode('without_ads')}
            className={`text-left rounded-xl border p-5 transition-colors cursor-pointer ${
              videoMode === 'without_ads'
                ? 'border-[#D4AF37] bg-[#D4AF37]/[0.08]'
                : 'border-white/[0.08] bg-[#0E0F13] hover:border-white/25'
            }`}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl sm:text-2xl font-semibold text-[#F4F1EA]">
                WITHOUT ADS
              </h2>
              <span className="text-xs font-mono-tabular text-neutral-400">Single Video</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setVideoMode('with_ads')}
            className={`text-left rounded-xl border p-5 transition-colors cursor-pointer ${
              videoMode === 'with_ads'
                ? 'border-[#D4AF37] bg-[#D4AF37]/[0.08]'
                : 'border-white/[0.08] bg-[#0E0F13] hover:border-white/25'
            }`}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl sm:text-2xl font-semibold text-[#F4F1EA]">
                WITH ADS
              </h2>
              <span className="text-xs font-mono-tabular text-neutral-400">Playlist</span>
            </div>
          </button>
        </div>

        {/* Hidden File Inputs */}
        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,video/webm,video/x-matroska,video/matroska,video/quicktime,.mp4,.m4v,.webm,.mkv,.mov,video/*"
          multiple={videoMode === 'with_ads'}
          className="hidden"
          onChange={(e) => handleFilesSelected(e.target.files)}
        />
        <input
          ref={replaceInputRef}
          type="file"
          accept="video/mp4,video/webm,video/x-matroska,video/matroska,video/quicktime,.mp4,.m4v,.webm,.mkv,.mov,video/*"
          multiple={false}
          className="hidden"
          onChange={(e) => handleReplaceFile(e.target.files)}
        />

        {/* Error Alert */}
        {uploadError && (
          <div
            role="alert"
            className="mt-6 flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200"
          >
            <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
            <span>{uploadError}</span>
          </div>
        )}

        {/* Main Workspace Split */}
        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start">
          {/* Left: Dropzone + Playlist Sequence */}
          <div className="lg:col-span-7 space-y-6">
            {/* Drag-and-drop File Dropzone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingFiles(true);
              }}
              onDragLeave={() => setIsDraggingFiles(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingFiles(false);
                handleFilesSelected(e.dataTransfer.files);
              }}
              onClick={() => !processingLabel && fileInputRef.current?.click()}
              className={`rounded-xl border-2 border-dashed p-5 sm:p-8 text-center transition-colors cursor-pointer ${
                isDraggingFiles
                  ? 'border-[#D4AF37] bg-[#D4AF37]/10'
                  : 'border-white/15 bg-[#0E0F13] hover:border-[#D4AF37]/60'
              }`}
            >
              <Upload className="mx-auto h-8 w-8 text-[#D4AF37]" />
              <h3 className="mt-3 text-base font-semibold text-[#F4F1EA]">
                {processingLabel
                  ? processingLabel
                  : videoMode === 'without_ads'
                    ? playlist.length > 0
                      ? 'Drop video or click to replace'
                      : 'Drop MP4, WebM, or MKV video or click to browse'
                    : 'Drop videos or click to add'}
              </h3>
            </div>

            {/* Uploaded Video List / Playlist Queue */}
            {playlist.length > 0 && (
              <div className="rounded-xl border border-white/[0.08] bg-[#0E0F13] overflow-hidden">
                <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
                  <h3 className="text-sm font-semibold text-[#F4F1EA]">
                    {videoMode === 'without_ads'
                      ? 'Selected Video'
                      : `Playlist (${playlist.length})`}
                  </h3>
                  <span className="font-mono-tabular text-xs text-[#E5C158]">
                    {formatDuration(totalDurationSeconds)}
                  </span>
                </div>

                <ul className="divide-y divide-white/[0.06]">
                  {playlist.map((item, idx) => {
                    const isDraggedOver = dragOverIndex === idx && dragIndex !== idx;
                    return (
                      <li
                        key={item.id}
                        draggable={videoMode === 'with_ads' && playlist.length > 1}
                        onDragStart={() => setDragIndex(idx)}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDragOverIndex(idx);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (dragIndex !== null && dragIndex !== idx) {
                            reorderPlaylist(dragIndex, idx);
                          }
                          setDragIndex(null);
                          setDragOverIndex(null);
                        }}
                        onDragEnd={() => {
                          setDragIndex(null);
                          setDragOverIndex(null);
                        }}
                        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 transition-colors ${
                          isDraggedOver ? 'bg-[#D4AF37]/10' : 'hover:bg-white/[0.02]'
                        }`}
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          {videoMode === 'with_ads' && (
                            <span
                              className="text-neutral-500 cursor-grab active:cursor-grabbing shrink-0"
                              title="Drag to reorder"
                            >
                              <GripVertical className="h-4 w-4" />
                            </span>
                          )}

                          <span className="font-mono-tabular text-xs font-semibold text-[#D4AF37] w-6 shrink-0">
                            {String(idx + 1).padStart(2, '0')}
                          </span>

                          {/* Video Frame Thumbnail */}
                          <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded border border-white/10 bg-black">
                            {item.thumbnailUrl ? (
                              <img
                                src={item.thumbnailUrl}
                                alt={item.fileName}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-neutral-600">
                                <Film className="h-4 w-4" />
                              </div>
                            )}
                          </div>

                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-[#F4F1EA]">
                              {item.fileName}
                            </p>
                            <p className="mt-0.5 font-mono-tabular text-xs text-neutral-400">
                              {formatDuration(item.duration)} · {formatFileSize(item.fileSize)} ·{' '}
                              {item.width}×{item.height}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                          {videoMode === 'with_ads' && playlist.length > 1 && (
                            <>
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => reorderPlaylist(idx, idx - 1)}
                                title="Move earlier"
                                aria-label={`Move ${item.fileName} earlier`}
                                className="flex h-8 w-8 items-center justify-center rounded border border-white/10 text-neutral-300 hover:bg-white/5 disabled:opacity-30 cursor-pointer"
                              >
                                <ArrowUp className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={idx === playlist.length - 1}
                                onClick={() => reorderPlaylist(idx, idx + 1)}
                                title="Move later"
                                aria-label={`Move ${item.fileName} later`}
                                className="flex h-8 w-8 items-center justify-center rounded border border-white/10 text-neutral-300 hover:bg-white/5 disabled:opacity-30 cursor-pointer"
                              >
                                <ArrowDown className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}

                          <button
                            type="button"
                            onClick={() => setPreviewItem(item)}
                            title="Preview video"
                            aria-label={`Preview ${item.fileName}`}
                            className="flex h-8 w-8 items-center justify-center rounded border border-white/10 text-neutral-300 hover:border-[#D4AF37]/60 hover:text-[#E5C158] cursor-pointer"
                          >
                            <Play className="h-3.5 w-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => triggerReplace(item.id)}
                            title="Replace video"
                            aria-label={`Replace ${item.fileName}`}
                            className="flex h-8 w-8 items-center justify-center rounded border border-white/10 text-neutral-300 hover:border-white/30 hover:text-white cursor-pointer"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => removePlaylistItem(item.id)}
                            title="Remove video"
                            aria-label={`Remove ${item.fileName}`}
                            className="flex h-8 w-8 items-center justify-center rounded border border-red-500/20 text-red-400 hover:bg-red-500/15 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>

          {/* Right: Video Preview & Continue */}
          <div className="lg:col-span-5 rounded-xl border border-white/[0.08] bg-[#0E0F13] p-6 space-y-6">
            <div className="min-w-0">
              <h3 className="font-display text-xl sm:text-2xl font-semibold text-[#F4F1EA] truncate">
                {activePreview ? activePreview.fileName : 'Preview'}
              </h3>
            </div>

            {activePreview ? (
              <div className="space-y-3">
                <div className="overflow-hidden rounded-lg border border-white/10 bg-black aspect-video">
                  <video
                    key={activePreview.objectUrl}
                    src={activePreview.objectUrl}
                    controls
                    playsInline
                    className="h-full w-full object-contain"
                  />
                </div>
                <div className="flex justify-between text-xs text-neutral-400 font-mono-tabular">
                  <span>{formatDuration(activePreview.duration)}</span>
                  <span>{formatFileSize(activePreview.fileSize)}</span>
                  <span>
                    {activePreview.width}×{activePreview.height}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex aspect-video w-full flex-col items-center justify-center rounded-lg border border-white/[0.06] bg-[#08090C] p-6 text-center">
                <Film className="h-8 w-8 text-neutral-600" />
                <p className="mt-2 text-xs text-neutral-500">No video selected</p>
              </div>
            )}

            <div className="border-t border-white/[0.08] pt-5 space-y-3">
              <div className="flex justify-between text-xs text-neutral-400">
                <span>Mode</span>
                <span className="text-[#F4F1EA] font-medium">
                  {videoMode === 'without_ads' ? 'Without Ads' : 'With Ads'}
                </span>
              </div>
              <div className="flex justify-between text-xs text-neutral-400">
                <span>Videos</span>
                <span className="font-mono-tabular text-[#F4F1EA] font-medium">
                  {playlist.length}
                </span>
              </div>
              <div className="flex justify-between text-xs text-neutral-400">
                <span>Runtime</span>
                <span className="font-mono-tabular text-[#E5C158] font-medium">
                  {formatDuration(totalDurationSeconds)}
                </span>
              </div>

              <button
                type="button"
                disabled={playlist.length === 0 || Boolean(processingLabel)}
                onClick={() => navigate('confirmation')}
                className={`mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md px-6 py-4 text-xs font-semibold uppercase tracking-wider transition-colors ${
                  playlist.length > 0 && !processingLabel
                    ? 'bg-[#D4AF37] text-[#070709] hover:bg-[#E5C158] cursor-pointer'
                    : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                }`}
              >
                <span>Continue</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
