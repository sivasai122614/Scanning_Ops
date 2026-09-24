// ==============================================================================
// Import Data for Inwarding & Dedicated Barcode Scanning Workflow
// Full-page Excel ingestion, schema validation, Class ID grouping,
// Supabase 'imported' table integration & direct camera scanner
// ==============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet,
  Upload,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Scan,
  RefreshCw,
  Camera,
  CameraOff,
  Search,
  Database,
  Users,
  Check,
  ChevronRight,
  Download,
  Eye,
  X,
  Zap,
  RotateCcw,
  Sparkles,
  ArrowRight,
  Maximize2,
  Copy,
} from 'lucide-react';
import {
  importedService,
  ImportedRecord,
  ClassIdSummary,
  ImportedStats,
  sanitizeBarcode,
} from '../../services/importedService';
import { playScanSuccessSound, playScanWarningSound } from '../../utils/scannerSound';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

interface ParsedRow {
  rowNumber: number;
  classId: string;
  memberId: string;
  status: 'valid' | 'duplicate' | 'invalid';
  reason?: string;
}

interface ClassGroup {
  classId: string;
  membersCount: number;
  members: string[];
}

export const ImportDataView: React.FC<{
  onNavigateToManualInward?: () => void;
}> = ({ onNavigateToManualInward }) => {
  // Navigation / Mode within Import Data screen
  const [activeTab, setActiveTab] = useState<'import' | 'scanner'>('import');

  // Excel parsing and preview state
  const [isParsing, setIsParsing] = useState(false);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<{ title: string; message: string } | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [classGroups, setClassGroups] = useState<ClassGroup[]>([]);
  const [summary, setSummary] = useState<{
    totalRecords: number;
    totalClassIds: number;
    validRecords: number;
    duplicateRecords: number;
    invalidRecords: number;
  } | null>(null);

  // Group Details Modal
  const [selectedGroupModal, setSelectedGroupModal] = useState<ClassGroup | null>(null);

  // Import All Execution state
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [importSuccessMessage, setImportSuccessMessage] = useState<string | null>(null);

  // Live Database Statistics & Summaries
  const [dbStats, setDbStats] = useState<ImportedStats>({
    scan_started: 0,
    scan_not_started: 0,
    total_imported: 0,
    class_ids_count: 0,
  });
  const [classSummaries, setClassSummaries] = useState<ClassIdSummary[]>([]);
  const [recentScans, setRecentScans] = useState<ImportedRecord[]>([]);

  // Camera & Live Scanner State
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const roiCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const zxingReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const zxingControlsRef = useRef<{ stop: () => void } | null>(null);
  const barcodeIntervalRef = useRef<any>(null);
  const isProcessingRef = useRef<boolean>(false);
  const lastScannedCodeRef = useRef<string | null>(null);
  const lastScannedTimeRef = useRef<number>(0);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState<boolean>(false);

  // Dynamic Active Class ID and Scanning Statistics (Section 9 & 15)
  const [activeClassId, setActiveClassId] = useState<string | null>(null);

  // Audio & Visual Feedback Overlays (Section 11, 12, 13)
  const [scanSuccessFlash, setScanSuccessFlash] = useState<{
    barcode: string;
    class_id: string;
    member_id: string;
  } | null>(null);
  const [scanWarningFlash, setScanWarningFlash] = useState<{
    title: string;
    message: string;
  } | null>(null);
  const [lastSuccessfulScan, setLastSuccessfulScan] = useState<{
    barcode: string;
    class_id: string;
    member_id: string;
    timestamp: string;
  } | null>(null);

  const [manualBarcodeInput, setManualBarcodeInput] = useState('');
  const [scannerNotification, setScannerNotification] = useState<{
    type: 'success' | 'warning' | 'error';
    title: string;
    message: string;
  } | null>(null);
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('all');
  const [previewPage, setPreviewPage] = useState<number>(1);

  // Supabase cloud migration & status modal state
  const [remoteStatus, setRemoteStatus] = useState<{ isConfigured: boolean; isRemoteTableAvailable: boolean }>({
    isConfigured: false,
    isRemoteTableAvailable: true,
  });
  const [showSqlMigrationModal, setShowSqlMigrationModal] = useState(false);
  const [isVerifyingSync, setIsVerifyingSync] = useState(false);
  const [syncVerificationResult, setSyncVerificationResult] = useState<{ success: boolean; message: string } | null>(null);
  const [hasCopiedSql, setHasCopiedSql] = useState(false);

  // Load Data on mount & subscribe
  const loadDatabaseData = useCallback(() => {
    const stats = importedService.getStats();
    const summaries = importedService.getClassIdSummaries();
    const allRecords = importedService.getRecords();
    const scannedOnes = allRecords
      .filter(r => r.scan_status === 'started' || r.scan_status === 'completed')
      .sort((a, b) => new Date(b.scanned_at || 0).getTime() - new Date(a.scanned_at || 0).getTime())
      .slice(0, 10);

    setDbStats(stats);
    setClassSummaries(summaries);
    setRecentScans(scannedOnes);
    setRemoteStatus(importedService.getRemoteStatus());

    // Auto-switch to scanner if data already exists and not in import preview
    if (stats.total_imported > 0 && !summary) {
      // User can still toggle freely
    }
  }, [summary]);

  useEffect(() => {
    loadDatabaseData();
    importedService.syncFromSupabase().then(() => {
      loadDatabaseData();
    });
    const unsubscribe = importedService.subscribe(loadDatabaseData);
    return () => unsubscribe();
  }, [loadDatabaseData]);

  // Handle Tab Change (Direct Camera Activation when entering Scanner tab)
  useEffect(() => {
    if (activeTab === 'scanner') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [activeTab]);

  // ----------------------------------------------------------------------------
  // EXCEL VALIDATION & LOCAL PARSING (Section 3, 4, 5)
  // ----------------------------------------------------------------------------
  const handleFileSelection = async (file: File) => {
    setValidationError(null);
    setSummary(null);
    setParsedRows([]);
    setClassGroups([]);
    setImportSuccessMessage(null);
    setPreviewPage(1);

    const validExtensions = ['.xlsx', '.xls', '.csv'];
    const fileName = file.name.toLowerCase();
    const hasValidExt = validExtensions.some(ext => fileName.endsWith(ext));

    if (!hasValidExt) {
      setValidationError({
        title: 'Invalid File Format',
        message: 'Please upload an Excel spreadsheet (.xlsx, .xls) or CSV file.',
      });
      return;
    }

    setExcelFile(file);
    setIsParsing(true);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];

      if (!firstSheetName) {
        setValidationError({
          title: 'Empty Excel File',
          message: 'The uploaded Excel file contains no worksheets.',
        });
        setIsParsing(false);
        return;
      }

      const worksheet = workbook.Sheets[firstSheetName];
      const rawData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (!rawData || rawData.length === 0) {
        setValidationError({
          title: 'Empty Excel File',
          message: 'The worksheet contains no data rows.',
        });
        setIsParsing(false);
        return;
      }

      // Check Header Row
      const headerRow = rawData[0] as string[];
      let classIdColIdx = -1;
      let memberIdColIdx = -1;

      headerRow.forEach((col, idx) => {
        if (!col) return;
        const normalized = String(col).trim().toLowerCase().replace(/[\s_-]/g, '');
        if (normalized === 'classid' || normalized === 'class') {
          classIdColIdx = idx;
        }
        if (normalized === 'memberid' || normalized === 'member' || normalized === 'rollno') {
          memberIdColIdx = idx;
        }
      });

      // Strict validation per Requirement 3:
      // "Class ID and Member ID are mandatory columns."
      if (classIdColIdx === -1 || memberIdColIdx === -1) {
        setValidationError({
          title: 'Invalid Excel File',
          message: 'Class ID and Member ID are mandatory columns. Please check your Excel header row.',
        });
        setIsParsing(false);
        return;
      }

      // Process rows
      const validRows: ParsedRow[] = [];
      const seenPairs = new Set<string>();
      let duplicateCount = 0;
      let invalidCount = 0;

      for (let i = 1; i < rawData.length; i++) {
        const row = rawData[i];
        if (!row || row.length === 0) continue;

        const rawClassId = row[classIdColIdx];
        const rawMemberId = row[memberIdColIdx];

        const classId = rawClassId !== undefined && rawClassId !== null ? String(rawClassId).trim() : '';
        const memberId = rawMemberId !== undefined && rawMemberId !== null ? String(rawMemberId).trim() : '';

        // Empty row check
        if (!classId && !memberId) {
          continue;
        }

        const rowNum = i + 1;

        if (!classId || !memberId) {
          invalidCount++;
          validRows.push({
            rowNumber: rowNum,
            classId: classId || '—',
            memberId: memberId || '—',
            status: 'invalid',
            reason: !classId ? 'Missing Class ID' : 'Missing Member ID',
          });
          continue;
        }

        const pairKey = `${classId.toLowerCase()}___${memberId.toLowerCase()}`;
        if (seenPairs.has(pairKey)) {
          duplicateCount++;
          validRows.push({
            rowNumber: rowNum,
            classId,
            memberId,
            status: 'duplicate',
            reason: 'Duplicate record in file',
          });
          continue;
        }

        seenPairs.add(pairKey);
        validRows.push({
          rowNumber: rowNum,
          classId,
          memberId,
          status: 'valid',
        });
      }

      const validList = validRows.filter(r => r.status === 'valid');
      const uniqueClassSet = new Set(validList.map(r => r.classId));

      // Group by Class ID (Section 5)
      const groupMap = new Map<string, string[]>();
      for (const row of validList) {
        if (!groupMap.has(row.classId)) {
          groupMap.set(row.classId, []);
        }
        groupMap.get(row.classId)!.push(row.memberId);
      }

      const groups: ClassGroup[] = Array.from(groupMap.entries())
        .map(([classId, members]) => ({
          classId,
          membersCount: members.length,
          members,
        }))
        .sort((a, b) => a.classId.localeCompare(b.classId));

      setParsedRows(validRows);
      setClassGroups(groups);
      setSummary({
        totalRecords: validRows.length,
        totalClassIds: uniqueClassSet.size,
        validRecords: validList.length,
        duplicateRecords: duplicateCount,
        invalidRecords: invalidCount,
      });
    } catch (err: any) {
      console.error('Excel processing error:', err);
      setValidationError({
        title: 'File Read Error',
        message: 'Could not read file. Ensure it is a valid, unencrypted Excel or CSV spreadsheet.',
      });
    } finally {
      setIsParsing(false);
    }
  };

  // ----------------------------------------------------------------------------
  // IMPORT ALL INTO SUPABASE (Section 6 & 7)
  // ----------------------------------------------------------------------------
  const handleImportAll = async () => {
    const validToImport = parsedRows
      .filter(r => r.status === 'valid')
      .map(r => ({
        class_id: r.classId,
        member_id: r.memberId,
      }));

    if (validToImport.length === 0) {
      setValidationError({
        title: 'No Valid Records',
        message: 'There are no valid records to import from the parsed file.',
      });
      return;
    }

    setIsImporting(true);
    setImportProgress({ current: 0, total: validToImport.length });

    try {
      const result = await importedService.bulkInsert(validToImport, (current, total) => {
        setImportProgress({ current, total });
      });

      if (result.success) {
        const isCloud = importedService.getRemoteStatus().isRemoteTableAvailable;
        setImportSuccessMessage(
          `Successfully imported ${result.inserted.toLocaleString()} records across ${classGroups.length} Class IDs ${
            isCloud ? 'into Supabase Cloud database.' : 'into high-speed storage (Ready for immediate scanning).'
          }`
        );
        // Clear preview
        setParsedRows([]);
        setExcelFile(null);
        setSummary(null);
        setClassGroups([]);
        loadDatabaseData();

        // Section 10: "After data import, the application should move directly into the scanning workflow."
        setTimeout(() => {
          setActiveTab('scanner');
        }, 1200);
      } else {
        setValidationError({
          title: 'Import Failed',
          message: result.error || 'Failed to complete database import.',
        });
      }
    } catch (e: any) {
      setValidationError({
        title: 'Import Error',
        message: e?.message || 'An unexpected error occurred during database insert.',
      });
    } finally {
      setIsImporting(false);
      setImportProgress(null);
    }
  };

  // ----------------------------------------------------------------------------
  // DOWNLOAD SAMPLE EXCEL TEMPLATE
  // ----------------------------------------------------------------------------
  const handleDownloadTemplate = () => {
    const templateData = [
      ['Class ID', 'Member ID'],
      ['0031', '21MIS0074'],
      ['0031', '22MIS0267'],
      ['0031', '21MIS0080'],
      ['0403', 'MIS0089'],
      ['0403', 'MIS0002'],
      ['0403', 'MIS0003'],
      ['0404', 'MIS0004'],
      ['0404', 'MIS0005'],
    ];

    const ws = XLSX.utils.aoa_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'InwardData');
    XLSX.writeFile(wb, 'ExamScan_Inward_Sample_Template.xlsx');
  };

  // ----------------------------------------------------------------------------
  // CAMERA STREAM & BARCODE SCANNER (Section 2, 3, 4, 5, 6 & V3)
  // ----------------------------------------------------------------------------
  const startCamera = async () => {
    setCameraLoading(true);
    setCameraError(null);
    setPermissionDenied(false);

    // Stop any existing stream
    stopCamera();

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access (getUserMedia) is not supported in this browser environment.');
      }

      let stream: MediaStream | null = null;

      // Section 4 (V3): High-resolution rear camera stream
      // Request 1080p environment stream with continuous autofocus
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 },
          },
          audio: false,
        });
      } catch (err1) {
        console.warn('1080p environment camera failed, falling back to 720p:', err1);
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });
        } catch (err2) {
          console.warn('720p environment camera failed, falling back to relaxed environment:', err2);
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: {
                facingMode: { ideal: 'environment' },
              },
              audio: false,
            });
          } catch (err3) {
            console.warn('Relaxed environment camera failed, falling back to any video device:', err3);
            stream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: false,
            });
          }
        }
      }

      if (!stream) {
        throw new Error('Could not establish video feed from any camera device.');
      }

      streamRef.current = stream;

      // Inspect actual track capabilities when available (Section 4)
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        try {
          const capabilities = typeof videoTrack.getCapabilities === 'function' ? videoTrack.getCapabilities() : {};
          const settings = typeof videoTrack.getSettings === 'function' ? videoTrack.getSettings() : {};
          console.info('[ExamScan Camera] Resolution:', settings.width, 'x', settings.height, 'Capabilities:', capabilities);

          // Apply continuous autofocus if supported
          if ((capabilities as any).focusMode && Array.isArray((capabilities as any).focusMode) && (capabilities as any).focusMode.includes('continuous')) {
            if (typeof videoTrack.applyConstraints === 'function') {
              await videoTrack.applyConstraints({
                advanced: [{ focusMode: 'continuous' } as any],
              }).catch(() => {});
            }
          }
        } catch (capsErr) {
          console.warn('[ExamScan Camera] Track capabilities note:', capsErr);
        }
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.muted = true;
        await videoRef.current.play().catch(e => console.warn('Autoplay note:', e));
      }

      setCameraActive(true);
      setCameraLoading(false);
      setPermissionDenied(false);
      setCameraError(null);

      // Start continuous scanning engine with prioritized wide horizontal ROI
      startContinuousScanner();
    } catch (err: any) {
      console.warn('Camera initialization or permission error:', err);
      setCameraActive(false);
      setCameraLoading(false);
      // Section 3: Do NOT permanently mark camera as unavailable!
      setPermissionDenied(true);
      setCameraError(
        err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError'
          ? 'Camera permission was denied. Please allow camera access in your browser settings.'
          : err?.message || 'Please allow camera access to start scanning.'
      );
    }
  };

  const stopCamera = () => {
    if (barcodeIntervalRef.current) {
      clearInterval(barcodeIntervalRef.current);
      barcodeIntervalRef.current = null;
    }
    if (zxingControlsRef.current) {
      try {
        zxingControlsRef.current.stop();
      } catch (e) {}
      zxingControlsRef.current = null;
    }
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach(track => track.stop());
      } catch (e) {}
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setCameraLoading(false);
  };

  // Section 2 & 5 (V3): Real Barcode Scanning Library with Prioritized Horizontal ROI
  const startContinuousScanner = () => {
    if (barcodeIntervalRef.current) {
      clearInterval(barcodeIntervalRef.current);
      barcodeIntervalRef.current = null;
    }
    if (zxingControlsRef.current) {
      try {
        zxingControlsRef.current.stop();
      } catch (e) {}
      zxingControlsRef.current = null;
    }

    const getRoiCanvas = (vw: number, vh: number) => {
      if (!roiCanvasRef.current) {
        roiCanvasRef.current = document.createElement('canvas');
      }
      // Section 5: Wide horizontal rectangular ROI:
      // ~90% width, ~25% height, centered horizontally & vertically (y ~ 37.5%)
      const roiWidth = Math.max(100, Math.round(vw * 0.90));
      const roiHeight = Math.max(50, Math.round(vh * 0.25));
      const roiX = Math.round(vw * 0.05);
      const roiY = Math.round(vh * 0.375);

      if (roiCanvasRef.current.width !== roiWidth || roiCanvasRef.current.height !== roiHeight) {
        roiCanvasRef.current.width = roiWidth;
        roiCanvasRef.current.height = roiHeight;
      }
      return { canvas: roiCanvasRef.current, roiX, roiY, roiWidth, roiHeight };
    };

    // Preferred approach: Native BarcodeDetector API (Section 2 & 5)
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        const detector = new (window as any).BarcodeDetector({
          formats: [
            'code_39',
            'code_128',
            'ean_13',
            'ean_8',
            'itf',
            'upc_a',
            'upc_e',
          ],
        });

        barcodeIntervalRef.current = setInterval(async () => {
          if (isProcessingRef.current) return;
          const video = videoRef.current;
          if (!video || video.readyState < 2 || video.videoWidth === 0) return;

          try {
            // 1. Crop to the wide horizontal scan ROI (Section 5)
            const { canvas, roiX, roiY, roiWidth, roiHeight } = getRoiCanvas(video.videoWidth, video.videoHeight);
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(video, roiX, roiY, roiWidth, roiHeight, 0, 0, roiWidth, roiHeight);
              try {
                const roiDetected = await detector.detect(canvas);
                if (roiDetected && roiDetected.length > 0 && roiDetected[0].rawValue) {
                  handleBarcodeScanned(roiDetected[0].rawValue);
                  return;
                }
              } catch (canvasErr) {
                // If canvas detection errors on specific browser, continue to full video element
              }
            }

            // 2. Fallback to full video frame if barcode is held slightly off-center
            const fullDetected = await detector.detect(video);
            if (fullDetected && fullDetected.length > 0 && fullDetected[0].rawValue) {
              handleBarcodeScanned(fullDetected[0].rawValue);
            }
          } catch (e) {
            // Frame skip
          }
        }, 90);
        return;
      } catch (nativeErr) {
        console.warn('Native BarcodeDetector initialization note, using ZXing fallback:', nativeErr);
      }
    }

    // Fallback approach: ZXing BrowserMultiFormatReader (Section 2 & 5)
    try {
      const hints = new Map<DecodeHintType, any>();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.CODE_39,
        BarcodeFormat.CODE_128,
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.ITF,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);

      const codeReader = new BrowserMultiFormatReader(hints);
      zxingReaderRef.current = codeReader;

      if (videoRef.current) {
        codeReader
          .decodeFromVideoElement(videoRef.current, (result, err) => {
            if (result) {
              const rawText = result.getText();
              if (rawText) {
                handleBarcodeScanned(rawText);
              }
            }
          })
          .then(controls => {
            zxingControlsRef.current = controls;
          })
          .catch(err => {
            console.warn('ZXing decode loop note:', err);
          });
      }
    } catch (zxingErr) {
      console.warn('ZXing initialization note:', zxingErr);
    }
  };

  // ----------------------------------------------------------------------------
  // BARCODE PROCESSING & MATCHING ENGINE (Section 7, 8, 9, 10, 11, 12, 13, 15 & V3)
  // ----------------------------------------------------------------------------
  const handleBarcodeScanned = async (rawCode: string) => {
    // 1. Sanitize barcode: strip whitespace and Code 39 start/stop asterisks (e.g. "*003121MIS0074*" => "003121MIS0074")
    const sanitized = sanitizeBarcode(rawCode);
    if (!sanitized || sanitized.length < 4) return;

    const now = Date.now();
    // 2. Camera Frame Debounce / Duplicate Scan Lock (V3 Item 4 & 5):
    // Continuous video stream captures 15-30 frames per second. If the user keeps holding the
    // same booklet in front of the lens, ignore identical barcode frames for 2.5 seconds.
    // This completely separates camera stream duplicate frames from Excel upload validation,
    // and prevents repeated buzzers/warnings on every camera tick.
    if (
      lastScannedCodeRef.current === sanitized &&
      now - lastScannedTimeRef.current < 2500
    ) {
      return;
    }

    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    lastScannedCodeRef.current = sanitized;
    lastScannedTimeRef.current = now;

    // 3. Section 7: Extract first 4 characters for Class ID: const classId = barcodeValue.substring(0, 4);
    const detectedClassId = sanitized.substring(0, 4);
    setActiveClassId(detectedClassId);

    try {
      // 4. Query Supabase / imported table and update record to 'started'
      const result = await importedService.processBarcode(sanitized);

      if (result.success) {
        // Section 11: AUDIO & VISUAL FEEDBACK
        playScanSuccessSound();
        const displayMember = result.member_id || (sanitized.length > 4 ? sanitized.substring(4) : '—');
        setLastSuccessfulScan({
          barcode: sanitized,
          class_id: result.class_id || detectedClassId,
          member_id: displayMember,
          timestamp: new Date().toLocaleTimeString(),
        });
        setScanSuccessFlash({
          barcode: sanitized,
          class_id: result.class_id || detectedClassId,
          member_id: displayMember,
        });
        setTimeout(() => setScanSuccessFlash(null), 1200);

        setScannerNotification({
          type: 'success',
          title: `Class ${result.class_id} • Verified`,
          message: `Scanned Barcode: ${sanitized} → Assigned to Member ${displayMember} (Status: Started)`,
        });
      } else {
        playScanWarningSound();
        if (result.isDuplicate) {
          // Section 12 & V3: DUPLICATE SCAN HANDLING (Alert operator once, no frame spam)
          setScanWarningFlash({
            title: 'Barcode Already Scanned',
            message: `Barcode: ${sanitized} (${result.message || 'Already marked as started'})`,
          });
          setTimeout(() => setScanWarningFlash(null), 1800);
          setScannerNotification({
            type: 'warning',
            title: 'Duplicate Barcode Scanned',
            message: `Barcode Already Scanned: ${sanitized}`,
          });
        } else if (result.isUnknownClass) {
          // Section 13: UNRECOGNIZED BARCODE HANDLING
          setScanWarningFlash({
            title: `Unknown Class ID: ${detectedClassId}`,
            message: `No imported records found for Class "${detectedClassId}".`,
          });
          setTimeout(() => setScanWarningFlash(null), 1800);
          setScannerNotification({
            type: 'error',
            title: `Unknown Class ID: ${detectedClassId}`,
            message: `No imported records found for Class "${detectedClassId}".`,
          });
        } else {
          setScanWarningFlash({
            title: 'Scan Alert',
            message: result.message,
          });
          setTimeout(() => setScanWarningFlash(null), 1800);
          setScannerNotification({
            type: 'warning',
            title: 'Scan Alert',
            message: result.message,
          });
        }
      }

      loadDatabaseData();
    } catch (e: any) {
      playScanWarningSound();
      setScannerNotification({
        type: 'error',
        title: 'Scanner Error',
        message: e?.message || 'Failed processing barcode',
      });
    } finally {
      // Continue camera scanning for next booklet after processing finishes + small buffer
      setTimeout(() => {
        isProcessingRef.current = false;
      }, 350);
    }
  };

  const handleManualBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualBarcodeInput.trim()) return;
    handleBarcodeScanned(manualBarcodeInput.trim());
    setManualBarcodeInput('');
  };

  // Filtered Class Summaries
  const filteredSummaries =
    selectedClassFilter === 'all'
      ? classSummaries
      : classSummaries.filter(s => s.class_id === selectedClassFilter);

  // Dynamic Active Class ID Statistics (Section 9 & 15)
  const currentActiveId = activeClassId || (classSummaries.length > 0 ? classSummaries[0].class_id : null);
  const activeClassStats = currentActiveId ? importedService.getClassStats(currentActiveId) : null;

  // Pagination for preview table
  const PAGE_SIZE = 15;
  const totalPreviewPages = Math.ceil(parsedRows.length / PAGE_SIZE) || 1;
  const displayedPreviewRows = parsedRows.slice((previewPage - 1) * PAGE_SIZE, previewPage * PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* 1. Header (Strictly as specified in Section 2) */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-[#EAF2FF] text-[#1565D8] rounded-lg">
                <FileSpreadsheet className="h-5 w-5" />
              </span>
              <h1 className="text-xl sm:text-2xl font-bold text-[#172033] tracking-tight">
                Import Data for Inwarding
              </h1>
            </div>
            <p className="text-sm text-[#64748B] mt-1 font-medium">
              Import Class ID and Member ID data from Excel
            </p>
          </div>

          {/* Mode Switcher & Cloud Status */}
          <div className="flex flex-wrap items-center gap-2">
            {remoteStatus.isConfigured && (
              <>
                {remoteStatus.isRemoteTableAvailable ? (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-800 text-xs font-semibold rounded-lg border border-emerald-200">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Supabase Cloud Synced</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setSyncVerificationResult(null);
                      setShowSqlMigrationModal(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold rounded-lg border border-amber-200 transition-colors shadow-2xs"
                    title="Click to view SQL schema for Supabase cloud sync"
                  >
                    <Database className="h-3.5 w-3.5 text-amber-600" />
                    <span>Local Cache Active • Cloud SQL</span>
                  </button>
                )}
              </>
            )}

            <div className="flex items-center p-1 bg-[#F1F5F9] rounded-xl self-start sm:self-auto border border-[#E2E8F0]">
              <button
                type="button"
                onClick={() => setActiveTab('import')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'import'
                    ? 'bg-white text-[#1565D8] shadow-xs'
                    : 'text-[#64748B] hover:text-[#172033]'
                }`}
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Import Excel</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('scanner')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'scanner'
                    ? 'bg-[#1565D8] text-white shadow-xs'
                    : 'text-[#64748B] hover:text-[#172033]'
                }`}
              >
                <Scan className="h-3.5 w-3.5" />
                <span>Scanning Dashboard ({dbStats.scan_started}/{dbStats.total_imported})</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Success Banner if just imported */}
      {importSuccessMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-3 text-emerald-800 animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <p className="text-xs sm:text-sm font-semibold">{importSuccessMessage}</p>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('scanner')}
            className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors shadow-xs"
          >
            <span>Open Scanner</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* 3. Validation Error Notification (Strictly as specified in Section 3) */}
      {validationError && (
        <div className="p-4 bg-rose-50 border-2 border-rose-300 rounded-xl flex items-start gap-3 text-rose-900 shadow-xs">
          <XCircle className="h-6 w-6 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-bold text-rose-900">{validationError.title}</h3>
            <p className="text-xs text-rose-800 mt-1 leading-relaxed font-medium">
              {validationError.message}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setValidationError(null)}
            className="text-rose-500 hover:text-rose-800 p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ========================================================================
          TAB 1: EXCEL IMPORT & PREVIEW & GROUPING
          ======================================================================== */}
      {activeTab === 'import' && (
        <div className="space-y-6">
          {/* File Ingestion Dropzone */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-base font-bold text-[#172033]">Upload Inward Excel File</h2>
                <p className="text-xs text-[#64748B]">
                  Columns required: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[#1565D8] font-mono font-bold">Class ID</code> and <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[#1565D8] font-mono font-bold">Member ID</code>
                </p>
              </div>

              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F1F5F9] text-[#1565D8] hover:bg-[#EAF2FF] border border-[#E2E8F0] rounded-lg text-xs font-semibold transition-colors self-start sm:self-auto"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download Sample Excel</span>
              </button>
            </div>

            <label className="relative border-2 border-dashed border-[#CBD5E1] hover:border-[#1565D8] rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-colors bg-[#FAFCFF] group">
              <input
                type="file"
                accept=".xlsx, .xls, .csv"
                className="hidden"
                disabled={isParsing || isImporting}
                onChange={e => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileSelection(e.target.files[0]);
                  }
                }}
              />
              <div className="w-12 h-12 rounded-full bg-[#EAF2FF] text-[#1565D8] flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                {isParsing ? (
                  <RefreshCw className="h-6 w-6 animate-spin text-[#1565D8]" />
                ) : (
                  <Upload className="h-6 w-6" />
                )}
              </div>
              <p className="text-sm font-semibold text-[#172033]">
                {excelFile ? excelFile.name : 'Click to select or drag and drop Excel file'}
              </p>
              <p className="text-xs text-[#64748B] mt-1">
                Supports Microsoft Excel (.xlsx, .xls) and CSV up to 100,000+ rows
              </p>
            </label>
          </div>

          {/* Section 4: IMPORT PREVIEW & SUMMARY */}
          {summary && (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div>
                <h3 className="text-xs font-bold text-[#64748B] uppercase tracking-wider mb-2">
                  Import Summary
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="bg-white p-3.5 rounded-xl border border-[#E2E8F0] shadow-xs">
                    <span className="text-[11px] font-semibold text-[#64748B] block">Total Records</span>
                    <span className="text-xl font-bold text-[#172033] mt-1 block">
                      {summary.totalRecords.toLocaleString()}
                    </span>
                  </div>

                  <div className="bg-white p-3.5 rounded-xl border border-[#E2E8F0] shadow-xs">
                    <span className="text-[11px] font-semibold text-[#64748B] block">Total Class IDs</span>
                    <span className="text-xl font-bold text-[#1565D8] mt-1 block">
                      {summary.totalClassIds}
                    </span>
                  </div>

                  <div className="bg-white p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/30 shadow-xs">
                    <span className="text-[11px] font-semibold text-emerald-800 block">Valid Records</span>
                    <span className="text-xl font-bold text-emerald-700 mt-1 block">
                      {summary.validRecords.toLocaleString()}
                    </span>
                  </div>

                  <div className="bg-white p-3.5 rounded-xl border border-amber-200 bg-amber-50/30 shadow-xs">
                    <span className="text-[11px] font-semibold text-amber-800 block">Duplicate Records</span>
                    <span className="text-xl font-bold text-amber-700 mt-1 block">
                      {summary.duplicateRecords.toLocaleString()}
                    </span>
                  </div>

                  <div className="bg-white p-3.5 rounded-xl border border-rose-200 bg-rose-50/30 shadow-xs">
                    <span className="text-[11px] font-semibold text-rose-800 block">Invalid Records</span>
                    <span className="text-xl font-bold text-rose-700 mt-1 block">
                      {summary.invalidRecords.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Section 5 & 6: CLASS ID WISE DATA GROUPING & CARDS */}
              <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E2E8F0] pb-3">
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-[#172033]">
                      Class ID Wise Import Grouping ({classGroups.length} Groups)
                    </h3>
                    <p className="text-xs text-[#64748B]">
                      Records automatically separated by Class ID for inward verification
                    </p>
                  </div>

                  {/* Section 6: IMPORT ALL BUTTON */}
                  <button
                    type="button"
                    onClick={handleImportAll}
                    disabled={isImporting || summary.validRecords === 0}
                    className="flex items-center gap-2 px-5 py-2.5 bg-[#1565D8] hover:bg-[#0D47A1] text-white rounded-xl font-bold text-xs sm:text-sm shadow-sm transition-all disabled:opacity-50"
                  >
                    {isImporting ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        <span>
                          Importing ({importProgress?.current || 0}/{importProgress?.total || summary.validRecords})...
                        </span>
                      </>
                    ) : (
                      <>
                        <Database className="h-4 w-4" />
                        <span>Import All ({summary.validRecords.toLocaleString()} Records)</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Class ID Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {classGroups.map(group => (
                    <div
                      key={group.classId}
                      className="p-4 rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] flex flex-col justify-between hover:border-[#1565D8] transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-[#64748B] font-semibold">Class ID:</span>
                            <span className="text-base font-bold text-[#172033] font-mono">
                              {group.classId}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-xs text-[#64748B] font-medium">Members:</span>
                            <span className="text-xs font-bold text-[#1565D8]">
                              {group.membersCount.toLocaleString()}
                            </span>
                          </div>
                        </div>

                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800">
                          Ready to Import
                        </span>
                      </div>

                      <div className="mt-4 pt-3 border-t border-[#E2E8F0] flex items-center justify-between">
                        <span className="text-[11px] text-[#64748B]">
                          First: {group.members[0]}
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedGroupModal(group)}
                          className="flex items-center gap-1 text-xs font-semibold text-[#1565D8] hover:underline"
                        >
                          <Eye className="h-3 w-3" />
                          <span>View Data</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview Table */}
              <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden shadow-xs">
                <div className="px-4 py-3 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center justify-between">
                  <span className="text-xs font-bold text-[#172033] uppercase tracking-wider">
                    Excel Preview Table (Showing {displayedPreviewRows.length} of {parsedRows.length})
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={previewPage <= 1}
                      onClick={() => setPreviewPage(p => Math.max(1, p - 1))}
                      className="px-2 py-1 text-xs font-semibold rounded bg-white border border-[#E2E8F0] disabled:opacity-40"
                    >
                      Prev
                    </button>
                    <span className="text-xs text-[#64748B]">
                      Page {previewPage} of {totalPreviewPages}
                    </span>
                    <button
                      type="button"
                      disabled={previewPage >= totalPreviewPages}
                      onClick={() => setPreviewPage(p => Math.min(totalPreviewPages, p + 1))}
                      className="px-2 py-1 text-xs font-semibold rounded bg-white border border-[#E2E8F0] disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#F1F5F9] text-[#64748B] font-semibold border-b border-[#E2E8F0]">
                      <tr>
                        <th className="px-4 py-2.5">Row</th>
                        <th className="px-4 py-2.5">Class ID</th>
                        <th className="px-4 py-2.5">Member ID</th>
                        <th className="px-4 py-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {displayedPreviewRows.map(row => (
                        <tr key={row.rowNumber} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-2 font-mono text-[#64748B]">{row.rowNumber}</td>
                          <td className="px-4 py-2 font-bold font-mono text-[#172033]">{row.classId}</td>
                          <td className="px-4 py-2 font-mono text-[#1565D8]">{row.memberId}</td>
                          <td className="px-4 py-2">
                            {row.status === 'valid' && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                                <Check className="h-3 w-3" /> Valid
                              </span>
                            )}
                            {row.status === 'duplicate' && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                                Duplicate
                              </span>
                            )}
                            {row.status === 'invalid' && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded">
                                Invalid ({row.reason})
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Quick Stats banner of existing database data */}
          {dbStats.total_imported > 0 && !summary && (
            <div className="p-4 bg-white rounded-xl border border-[#E2E8F0] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#EAF2FF] text-[#1565D8] flex items-center justify-center font-bold">
                  {dbStats.class_ids_count}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[#172033]">
                    {dbStats.total_imported.toLocaleString()} Imported Records Active
                  </h4>
                  <p className="text-xs text-[#64748B]">
                    {dbStats.scan_started.toLocaleString()} Scanned • {dbStats.scan_not_started.toLocaleString()} Remaining
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('scanner')}
                  className="flex items-center gap-2 px-4 py-2 bg-[#1565D8] text-white rounded-xl font-bold text-xs shadow-xs hover:bg-[#0D47A1] transition-colors"
                >
                  <Scan className="h-4 w-4" />
                  <span>Open Barcode Scanner</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================
          TAB 2: POST-IMPORT SCANNING DASHBOARD & DIRECT CAMERA SCANNER
          (Sections 9, 10, 11, 12, 13, 14, 15, 16, 20)
          ======================================================================== */}
      {activeTab === 'scanner' && (
        <div className="space-y-6">
          {/* Section 9: 4 MAIN STATISTICS */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-bold text-[#64748B] uppercase tracking-wider">
                Scanning Operational Dashboard
              </h2>
              <button
                type="button"
                onClick={loadDatabaseData}
                className="flex items-center gap-1 text-xs text-[#1565D8] font-semibold hover:underline"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Refresh Counts</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* 1. Scan Started */}
              <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                    Scan Started
                  </span>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="text-2xl sm:text-3xl font-black text-emerald-700 mt-2">
                  {dbStats.scan_started.toLocaleString()}
                </div>
                <p className="text-[10px] text-emerald-800/80 font-medium mt-1">
                  Booklets successfully matched
                </p>
              </div>

              {/* 2. Scan Not Started */}
              <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/20 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                    Scan Not Started
                  </span>
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                </div>
                <div className="text-2xl sm:text-3xl font-black text-amber-700 mt-2">
                  {dbStats.scan_not_started.toLocaleString()}
                </div>
                <p className="text-[10px] text-amber-800/80 font-medium mt-1">
                  Total Users - Scan Started
                </p>
              </div>

              {/* 3. Imported Users */}
              <div className="bg-white p-4 rounded-xl border border-[#CBD5E1] shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                    Imported Users
                  </span>
                  <Users className="h-4 w-4 text-[#1565D8]" />
                </div>
                <div className="text-2xl sm:text-3xl font-black text-[#172033] mt-2">
                  {dbStats.total_imported.toLocaleString()}
                </div>
                <p className="text-[10px] text-[#64748B] font-medium mt-1">
                  Valid imported records
                </p>
              </div>

              {/* 4. Class ID Count */}
              <div className="bg-white p-4 rounded-xl border border-[#CBD5E1] shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                    Class ID Count
                  </span>
                  <Database className="h-4 w-4 text-[#64748B]" />
                </div>
                <div className="text-2xl sm:text-3xl font-black text-[#172033] mt-2">
                  {dbStats.class_ids_count}
                </div>
                <p className="text-[10px] text-[#64748B] font-medium mt-1">
                  Unique Class groups
                </p>
              </div>
            </div>
          </div>

          {/* Section 9 & 15: DYNAMIC ACTIVE CLASS ID STATISTICS CARD */}
          {activeClassStats && (
            <div className="bg-white rounded-xl border-2 border-[#1565D8] p-4 sm:p-5 shadow-xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E2E8F0] pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
                    Active Class ID:
                  </span>
                  <span className="text-lg sm:text-xl font-black font-mono text-[#1565D8] bg-[#EAF2FF] px-2.5 py-0.5 rounded-lg">
                    {activeClassStats.class_id}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200">
                    Auto-Detected
                  </span>
                </div>
                <div className="text-xs text-[#64748B] flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Real-time Class Inwarding</span>
                </div>
              </div>

              {/* Section 9 Stats Layout */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Total Members */}
                <div className="p-3 bg-[#F8FAFC] rounded-xl border border-[#CBD5E1]">
                  <span className="text-[11px] font-semibold text-[#64748B] block">Total Members</span>
                  <span className="text-2xl font-black text-[#172033] mt-1 block font-mono">
                    {activeClassStats.total_members.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-[#64748B]">Imported rows for Class {activeClassStats.class_id}</span>
                </div>

                {/* Total Scanned */}
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="text-[11px] font-bold text-emerald-800 block">Total Scanned</span>
                  <span className="text-2xl font-black text-emerald-700 mt-1 block font-mono">
                    {activeClassStats.total_scanned.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-emerald-700/80">Status: started</span>
                </div>

                {/* Pending */}
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
                  <span className="text-[11px] font-bold text-amber-800 block">Pending</span>
                  <span className="text-2xl font-black text-amber-700 mt-1 block font-mono">
                    {activeClassStats.pending.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-amber-700/80">Total - Scanned</span>
                </div>

                {/* Progress */}
                <div className="p-3 bg-blue-50 rounded-xl border border-blue-200">
                  <span className="text-[11px] font-bold text-[#1565D8] block">Progress</span>
                  <span className="text-2xl font-black text-[#1565D8] mt-1 block font-mono">
                    {activeClassStats.progress_percentage}%
                  </span>
                  <span className="text-[10px] text-[#1565D8]/80">Completion rate</span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1 pt-1">
                <div className="flex items-center justify-between text-[11px] font-medium text-[#64748B]">
                  <span>Class {activeClassStats.class_id} Inward Progress</span>
                  <span className="font-mono font-bold text-[#172033]">
                    {activeClassStats.total_scanned} / {activeClassStats.total_members} booklets
                  </span>
                </div>
                <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 transition-all duration-300 rounded-full"
                    style={{ width: `${activeClassStats.progress_percentage}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Section 11: Real-time Last Scanned Result Banner */}
          {lastSuccessfulScan && (
            <div className="p-3.5 bg-emerald-50 border-2 border-emerald-300 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-start sm:items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Check className="h-5 w-5 stroke-[2.5]" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-emerald-950 uppercase tracking-wide">
                      Last Scanned Booklet:
                    </span>
                    <span className="text-xs font-mono font-black text-emerald-900 bg-white px-2 py-0.5 rounded border border-emerald-200 shadow-2xs">
                      {lastSuccessfulScan.barcode}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-200/70 px-2 py-0.5 rounded-full">
                      Started
                    </span>
                  </div>
                  <div className="text-xs text-emerald-800 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span>Class ID: <strong className="font-mono font-bold">{lastSuccessfulScan.class_id}</strong></span>
                    <span>•</span>
                    <span>Member ID: <strong className="font-mono font-bold">{lastSuccessfulScan.member_id}</strong></span>
                    <span>•</span>
                    <span>Status: <strong className="text-emerald-700">Started</strong></span>
                    <span>•</span>
                    <span>Time: <span className="font-mono">{lastSuccessfulScan.timestamp}</span></span>
                  </div>
                </div>
              </div>
              <div className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1 shrink-0 self-end sm:self-auto">
                <CheckCircle2 className="h-4 w-4" />
                <span>Ready for Next Scan</span>
              </div>
            </div>
          )}

          {/* Section 5, 10 & 11: LIVE CAMERA SCANNER VIEW */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden shadow-xs">
            <div className="px-4 py-3 bg-[#172033] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Scan className="h-4 w-4 text-[#1565D8]" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  Live Barcode Camera Scanner (Auto Class ID Detection)
                </span>
              </div>

              <div className="flex items-center gap-2">
                {cameraActive ? (
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="flex items-center gap-1 px-2.5 py-1 bg-white/10 hover:bg-white/20 rounded text-[11px] font-semibold text-slate-200 cursor-pointer active:scale-95 transition-all"
                  >
                    <CameraOff className="h-3 w-3" />
                    <span>Pause</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startCamera}
                    className="flex items-center gap-1 px-2.5 py-1 bg-[#1565D8] hover:bg-[#0D47A1] rounded text-[11px] font-semibold text-white cursor-pointer active:scale-95 transition-all"
                  >
                    <Camera className="h-3 w-3" />
                    <span>Start Camera</span>
                  </button>
                )}
              </div>
            </div>

            {/* Notification Banner */}
            {scannerNotification && (
              <div
                className={`p-3.5 border-b flex items-start justify-between gap-3 text-xs font-semibold ${
                  scannerNotification.type === 'success'
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                    : scannerNotification.type === 'warning'
                    ? 'bg-amber-50 text-amber-900 border-amber-200'
                    : 'bg-rose-50 text-rose-900 border-rose-200'
                }`}
              >
                <div className="flex items-start gap-2">
                  {scannerNotification.type === 'success' && (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                  )}
                  {scannerNotification.type === 'warning' && (
                    <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  )}
                  {scannerNotification.type === 'error' && (
                    <XCircle className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />
                  )}
                  <div>
                    <div className="font-bold">{scannerNotification.title}</div>
                    <div className="text-[11px] font-normal mt-0.5">{scannerNotification.message}</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setScannerNotification(null)}
                  className="opacity-70 hover:opacity-100 p-0.5 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Mobile-Optimized Wide Horizontal Camera Container (Matches Reference Image) */}
            <div className="p-3 sm:p-4 bg-[#F8FAFC]">
              {/* Live Camera Preview: Wide Horizontal Black Rectangle */}
              <div className="relative w-full max-w-[720px] aspect-[2.9/1] sm:aspect-[3.2/1] min-h-[110px] max-h-[175px] sm:max-h-[220px] bg-black rounded-xl overflow-hidden shadow-md border border-slate-900 mx-auto flex items-center justify-center">
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  playsInline
                  muted
                  autoPlay
                />

                {/* Wide Horizontal Scan Guide (Section 6, 8 & Reference Image) */}
                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-2 sm:p-3">
                  <div className="relative w-[94%] h-[82%] rounded-lg border border-emerald-400/80 flex items-center justify-center">
                    {/* Corner Reticle Accents */}
                    <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-emerald-400 rounded-tl-xs" />
                    <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-emerald-400 rounded-tr-xs" />
                    <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-emerald-400 rounded-bl-xs" />
                    <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-emerald-400 rounded-br-xs" />

                    {/* Scan Guide Text */}
                    <div className="relative z-10 px-2.5 py-0.5 bg-black/65 backdrop-blur-xs rounded-full border border-emerald-400/30 flex items-center gap-1.5">
                      <span className="text-emerald-400 text-[10px] select-none">─────</span>
                      <span className="text-[9px] sm:text-[11px] font-black text-emerald-300 uppercase tracking-wider">
                        SCAN BARCODE HERE
                      </span>
                      <span className="text-emerald-400 text-[10px] select-none">─────</span>
                    </div>

                    {/* Full Width Laser Scanning Guide Line */}
                    <div className="absolute left-1.5 right-1.5 top-1/2 -translate-y-1/2 h-[1.5px] bg-rose-500/90 shadow-[0_0_8px_#f43f5e] animate-pulse" />
                  </div>
                </div>

                {/* Green Check Flash Overlay (Section 11) */}
                {scanSuccessFlash && (
                  <div className="absolute inset-0 bg-emerald-600/40 backdrop-blur-xs flex items-center justify-center text-white z-30 transition-all p-2">
                    <div className="bg-black/90 px-3.5 py-1.5 rounded-xl text-center shadow-lg border border-emerald-400/50 flex items-center gap-2.5 max-w-[90%]">
                      <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
                        <CheckCircle2 className="h-4 w-4 stroke-[3]" />
                      </div>
                      <div className="text-left min-w-0">
                        <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider truncate">
                          ✓ Verified & Started
                        </div>
                        <div className="text-xs font-mono font-bold text-white truncate">
                          {scanSuccessFlash.barcode} (Class {scanSuccessFlash.class_id} • {scanSuccessFlash.member_id})
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Amber Warning Flash Overlay (Section 12 & 13) */}
                {scanWarningFlash && (
                  <div className="absolute inset-0 bg-amber-600/35 backdrop-blur-xs flex items-center justify-center text-white z-30 transition-all p-2">
                    <div className="bg-black/90 px-3.5 py-1.5 rounded-xl text-center shadow-lg border border-amber-400/60 flex items-center gap-2.5 max-w-[90%]">
                      <div className="w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center shrink-0">
                        <AlertTriangle className="h-4 w-4 stroke-[2.5]" />
                      </div>
                      <div className="text-left min-w-0">
                        <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider truncate">
                          {scanWarningFlash.title}
                        </div>
                        <div className="text-[11px] font-medium text-slate-200 truncate">
                          {scanWarningFlash.message}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Camera Loading Overlay */}
                {cameraLoading && (
                  <div className="absolute inset-0 bg-black/90 flex flex-row items-center justify-center gap-2 text-white z-20">
                    <RefreshCw className="h-5 w-5 animate-spin text-[#1565D8]" />
                    <span className="text-xs font-semibold">Starting Camera...</span>
                  </div>
                )}

                {/* Camera Permission Required Overlay */}
                {(permissionDenied || cameraError) && !cameraLoading && (
                  <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-xs flex flex-row items-center justify-center gap-2.5 px-3 py-2 text-white z-20">
                    <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                      <Camera className="h-4 w-4" />
                    </div>
                    <div className="text-left flex-1 min-w-0">
                      <div className="text-xs font-bold text-white truncate">Camera Permission Required</div>
                      <div className="text-[10px] text-slate-300 truncate">Allow camera access to start scanning</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={startCamera}
                        className="px-2.5 py-1 bg-[#1565D8] hover:bg-[#0D47A1] text-white rounded-lg text-[10px] font-bold transition-all shadow-xs flex items-center gap-1 cursor-pointer"
                      >
                        <Camera className="h-3 w-3" />
                        <span>Allow</span>
                      </button>
                      <button
                        type="button"
                        onClick={startCamera}
                        className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg text-[10px] font-bold border border-white/20 transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="h-3 w-3" />
                        <span>Retry</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Status Below Camera: ● Searching for barcode... (Matches Section 9 & 13) */}
              <div className="mt-2.5 flex items-center justify-center gap-2 text-[11px] font-medium text-[#64748B]">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                <span>Searching for barcode... (Hold booklet at comfortable distance)</span>
              </div>
            </div>

            {/* Quick Test Barcodes Simulation Bar */}
            <div className="px-4 py-2.5 bg-slate-100 border-t border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-[#1565D8]" />
                <span className="text-[11px] font-bold text-[#172033] uppercase tracking-wider">
                  Quick Test Barcodes:
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {classSummaries.length > 0 ? (
                  <>
                    {classSummaries.slice(0, 3).map(cs => {
                      const sampleRecord = importedService.getRecords(cs.class_id)[0];
                      const sampleCode = sampleRecord
                        ? `${cs.class_id}22${sampleRecord.member_id}`
                        : `${cs.class_id}22MIS0001`;
                      return (
                        <button
                          key={cs.class_id}
                          type="button"
                          onClick={() => handleBarcodeScanned(sampleCode)}
                          className="px-2.5 py-1 bg-white hover:bg-[#1565D8] hover:text-white text-[#1565D8] rounded-md font-mono text-[11px] font-bold border border-[#CBD5E1] transition-all shadow-2xs cursor-pointer active:scale-95"
                        >
                          Scan {sampleCode}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => handleBarcodeScanned('099999UNKNOWN')}
                      className="px-2.5 py-1 bg-white hover:bg-rose-600 hover:text-white text-rose-600 rounded-md font-mono text-[11px] font-bold border border-rose-200 transition-all shadow-2xs cursor-pointer active:scale-95"
                      title="Test Unrecognized Class ID"
                    >
                      Scan 0999 (Unknown)
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => handleBarcodeScanned('*003121MIS0074*')}
                      className="px-2.5 py-1 bg-white hover:bg-[#1565D8] hover:text-white text-[#1565D8] rounded-md font-mono text-[11px] font-bold border border-[#CBD5E1] transition-all shadow-2xs cursor-pointer active:scale-95"
                      title="Test Code 39 asterisk format"
                    >
                      Scan *003121MIS0074*
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBarcodeScanned('003122MIS0267')}
                      className="px-2.5 py-1 bg-white hover:bg-[#1565D8] hover:text-white text-[#1565D8] rounded-md font-mono text-[11px] font-bold border border-[#CBD5E1] transition-all shadow-2xs cursor-pointer active:scale-95"
                    >
                      Scan 003122MIS0267
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBarcodeScanned('040322MIS0089')}
                      className="px-2.5 py-1 bg-white hover:bg-[#1565D8] hover:text-white text-[#1565D8] rounded-md font-mono text-[11px] font-bold border border-[#CBD5E1] transition-all shadow-2xs cursor-pointer active:scale-95"
                    >
                      Scan 040322MIS0089
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBarcodeScanned('040422MIS0004')}
                      className="px-2.5 py-1 bg-white hover:bg-[#1565D8] hover:text-white text-[#1565D8] rounded-md font-mono text-[11px] font-bold border border-[#CBD5E1] transition-all shadow-2xs cursor-pointer active:scale-95"
                    >
                      Scan 040422MIS0004
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Quick Barcode Scanner Input (USB Gun / Manual Entry) */}
            <div className="p-4 bg-[#F8FAFC]">
              <form onSubmit={handleManualBarcodeSubmit} className="flex gap-2">
                <div className="relative flex-1">
                  <Scan className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
                  <input
                    type="text"
                    value={manualBarcodeInput}
                    onChange={e => setManualBarcodeInput(e.target.value)}
                    placeholder="Enter or scan barcode (e.g. 040322MIS0089)..."
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-[#CBD5E1] bg-white font-mono focus:outline-none focus:ring-2 focus:ring-[#1565D8]"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#1565D8] hover:bg-[#0D47A1] text-white rounded-lg text-xs font-bold transition-colors shadow-xs cursor-pointer active:scale-95"
                >
                  Verify Barcode
                </button>
              </form>
              <div className="flex items-center justify-between text-[11px] text-[#64748B] mt-2">
                <span>First 4 characters automatically detect Class ID (Section 7 & 12)</span>
                <span>Auto-updates database status to "started"</span>
              </div>
            </div>
          </div>

          {/* Section 14: COMPACT SCAN LOG */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden shadow-xs">
            <div className="px-4 py-3 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#172033]">
                  Recent Scans Log
                </h4>
                <span className="text-[11px] font-semibold text-[#64748B] bg-slate-200 px-2 py-0.5 rounded-full">
                  {recentScans.length}
                </span>
              </div>
              <span className="text-[11px] text-[#64748B]">Real-time inwarding audit feed</span>
            </div>

            {recentScans.length === 0 ? (
              <div className="py-6 text-center text-xs text-[#64748B]">
                No barcodes scanned yet. Align a booklet barcode within the camera viewfinder to start inwarding.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F1F5F9] text-[#64748B] font-semibold border-b border-[#E2E8F0]">
                    <tr>
                      <th className="px-4 py-2.5">Class ID</th>
                      <th className="px-4 py-2.5">Member ID</th>
                      <th className="px-4 py-2.5">Barcode</th>
                      <th className="px-4 py-2.5">Scanned At</th>
                      <th className="px-4 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {recentScans.map(scan => (
                      <tr key={scan.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-2.5 font-bold font-mono text-[#172033]">{scan.class_id}</td>
                        <td className="px-4 py-2.5 font-mono text-[#1565D8] font-semibold">{scan.member_id}</td>
                        <td className="px-4 py-2.5 font-mono text-[#64748B]">{scan.barcode || '—'}</td>
                        <td className="px-4 py-2.5 text-[#64748B]">
                          {scan.scanned_at ? new Date(scan.scanned_at).toLocaleTimeString() : '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                            <Check className="h-3 w-3" /> Started
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Section 16: CLASS ID-WISE SCAN PROGRESS TABLE */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E2E8F0] pb-3">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-[#172033]">
                  Class ID Wise Scanning Progress
                </h3>
                <p className="text-xs text-[#64748B]">
                  Real-time status calculated from Supabase <code className="font-mono text-[#1565D8]">imported</code> table
                </p>
              </div>

              {/* Class Filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#64748B] font-medium">Filter Class:</span>
                <select
                  value={selectedClassFilter}
                  onChange={e => setSelectedClassFilter(e.target.value)}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-[#CBD5E1] bg-white text-[#172033] font-mono focus:outline-none"
                >
                  <option value="all">All Classes ({classSummaries.length})</option>
                  {classSummaries.map(s => (
                    <option key={s.class_id} value={s.class_id}>
                      Class {s.class_id}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Table */}
            {filteredSummaries.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#64748B]">
                No imported Class data found. Please import an Excel file to begin scanning.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F1F5F9] text-[#64748B] font-semibold border-b border-[#E2E8F0]">
                    <tr>
                      <th className="px-4 py-2.5">Class ID</th>
                      <th className="px-4 py-2.5">Imported</th>
                      <th className="px-4 py-2.5">Scanned</th>
                      <th className="px-4 py-2.5">Remaining</th>
                      <th className="px-4 py-2.5">Progress</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {filteredSummaries.map(summary => {
                      const percent =
                        summary.total_imported > 0
                          ? Math.round((summary.scanned_count / summary.total_imported) * 100)
                          : 0;

                      return (
                        <tr key={summary.class_id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-2.5 font-bold font-mono text-[#172033] text-sm">
                            {summary.class_id}
                          </td>
                          <td className="px-4 py-2.5 font-semibold text-[#172033]">
                            {summary.total_imported.toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5 font-bold text-emerald-700">
                            {summary.scanned_count.toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5 font-bold text-amber-700">
                            {summary.remaining_count.toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5 min-w-[140px]">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-emerald-600 transition-all duration-300"
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                              <span className="text-[11px] font-mono font-bold text-[#64748B] w-9 text-right">
                                {percent}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------------
          MODAL: VIEW CLASS GROUP DATA
          ------------------------------------------------------------------------ */}
      {selectedGroupModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-xl border border-[#E2E8F0] max-w-md w-full p-5 shadow-xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3 mb-3">
              <div>
                <h3 className="text-base font-bold text-[#172033]">
                  Class ID: {selectedGroupModal.classId}
                </h3>
                <p className="text-xs text-[#64748B]">
                  {selectedGroupModal.membersCount.toLocaleString()} Total Members Parsed
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedGroupModal(null)}
                className="text-[#64748B] hover:text-[#172033] p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 pr-1">
              {selectedGroupModal.members.map((member, idx) => (
                <div
                  key={idx}
                  className="px-3 py-1.5 rounded bg-slate-50 border border-slate-100 flex items-center justify-between text-xs"
                >
                  <span className="text-[#64748B] font-mono">#{idx + 1}</span>
                  <span className="font-mono font-bold text-[#1565D8]">{member}</span>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-3 border-t border-[#E2E8F0] flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedGroupModal(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-[#172033] rounded-lg text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------------
          MODAL: SUPABASE CLOUD SQL MIGRATION HELPER
          ------------------------------------------------------------------------ */}
      {showSqlMigrationModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-xl border border-[#E2E8F0] max-w-2xl w-full p-6 shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-[#EAF2FF] text-[#1565D8] rounded-lg">
                  <Database className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-[#172033]">
                    Supabase Cloud Sync Setup
                  </h3>
                  <p className="text-xs text-[#64748B]">
                    Enable cloud persistence for the <code className="font-mono text-[#1565D8]">public.imported</code> table
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSqlMigrationModal(false)}
                className="text-[#64748B] hover:text-[#172033] p-1 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-900 leading-relaxed">
                <p className="font-semibold mb-1">Local Storage is Currently Active</p>
                <p className="text-blue-800">
                  All Excel data ingestion, previewing, Class ID grouping, and high-speed camera barcode scanning are already running smoothly with offline resilience.
                  To synchronize this table with your Supabase cloud project across multiple devices, run this 1-step SQL query in your <strong>Supabase Dashboard → SQL Editor</strong>.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">Migration SQL Script:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const sql = `-- Create the 'imported' table in Supabase
CREATE TABLE IF NOT EXISTS public.imported (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id VARCHAR(100) NOT NULL,
  member_id VARCHAR(100) NOT NULL,
  barcode VARCHAR(255),
  scan_status VARCHAR(50) NOT NULL DEFAULT 'not_started' CHECK (scan_status IN ('not_started', 'started', 'completed')),
  scanned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_imported_class_id ON public.imported(class_id);
CREATE INDEX IF NOT EXISTS idx_imported_member_id ON public.imported(member_id);
CREATE INDEX IF NOT EXISTS idx_imported_barcode ON public.imported(barcode);
CREATE INDEX IF NOT EXISTS idx_imported_scan_status ON public.imported(scan_status);

ALTER TABLE public.imported ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon all on imported" ON public.imported;
CREATE POLICY "Allow anon all on imported" ON public.imported FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated all on imported" ON public.imported;
CREATE POLICY "Allow authenticated all on imported" ON public.imported FOR ALL TO authenticated USING (true) WITH CHECK (true);`;
                      navigator.clipboard.writeText(sql);
                      setHasCopiedSql(true);
                      setTimeout(() => setHasCopiedSql(false), 2500);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-semibold text-xs transition-colors"
                  >
                    {hasCopiedSql ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        <span className="text-emerald-700">Copied to Clipboard!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy SQL Query</span>
                      </>
                    )}
                  </button>
                </div>

                <pre className="p-3.5 bg-slate-900 text-slate-100 rounded-lg font-mono text-[11px] leading-relaxed overflow-x-auto max-h-48 border border-slate-800">
{`CREATE TABLE IF NOT EXISTS public.imported (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id VARCHAR(100) NOT NULL,
  member_id VARCHAR(100) NOT NULL,
  barcode VARCHAR(255),
  scan_status VARCHAR(50) NOT NULL DEFAULT 'not_started' CHECK (scan_status IN ('not_started', 'started', 'completed')),
  scanned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_imported_class_id ON public.imported(class_id);
CREATE INDEX IF NOT EXISTS idx_imported_member_id ON public.imported(member_id);
CREATE INDEX IF NOT EXISTS idx_imported_barcode ON public.imported(barcode);
CREATE INDEX IF NOT EXISTS idx_imported_scan_status ON public.imported(scan_status);

ALTER TABLE public.imported ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon all on imported" ON public.imported FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated all on imported" ON public.imported FOR ALL TO authenticated USING (true) WITH CHECK (true);`}
                </pre>
              </div>

              {syncVerificationResult && (
                <div
                  className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${
                    syncVerificationResult.success
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}
                >
                  {syncVerificationResult.success ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  )}
                  <span>{syncVerificationResult.message}</span>
                </div>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                disabled={isVerifyingSync}
                onClick={async () => {
                  setIsVerifyingSync(true);
                  setSyncVerificationResult(null);
                  try {
                    const res = await importedService.retryCloudSync();
                    setSyncVerificationResult(res);
                    if (res.success) {
                      loadDatabaseData();
                    }
                  } finally {
                    setIsVerifyingSync(false);
                  }
                }}
                className="flex items-center gap-2 px-4 py-2 bg-[#1565D8] hover:bg-[#0D47A1] text-white rounded-lg text-xs font-semibold shadow-xs disabled:opacity-50 transition-colors"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isVerifyingSync ? 'animate-spin' : ''}`} />
                <span>{isVerifyingSync ? 'Checking Connection...' : 'Verify Cloud Connection & Sync'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowSqlMigrationModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-[#172033] rounded-lg text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
