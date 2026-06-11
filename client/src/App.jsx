import { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'
import './App.css'

// ─── Smooth Ripple Effect for Buttons ───
function useRippleEffect() {
  useEffect(() => {
    const handler = (e) => {
      const btn = e.target.closest('button')
      if (!btn || btn.dataset.noRipple) return
      const rect = btn.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const size = Math.max(rect.width, rect.height) * 1.4
      const ripple = document.createElement('span')
      ripple.className = 'ripple-effect'
      ripple.style.cssText = `left:${x}px;top:${y}px;width:${size}px;height:${size}px`
      btn.appendChild(ripple)
      ripple.addEventListener('animationend', () => ripple.remove())
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])
}

// ─── Smooth Page Transition ───
function useSmoothPage(page) {
  const [transitioning, setTransitioning] = useState(false)
  const [prevPage, setPrevPage] = useState(null)
  useEffect(() => {
    if (prevPage !== null && prevPage !== page) {
      setTransitioning(true)
      const t = setTimeout(() => { setTransitioning(false); setPrevPage(page) }, 300)
      return () => clearTimeout(t)
    }
    setPrevPage(page)
  }, [page, prevPage])
  return transitioning
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

const api = axios.create({ baseURL: API_URL, timeout: 15000 })
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ═══════════ WEB SPEECH RECOGNITION WITH SILENCE AUTO-SUBMIT ═══════════
function useSpeechRecognition({ onAutoSubmit, autoSubmitEnabled = true }) {
  const [listening, setListening] = useState(false)
  const [finalTranscript, setFinalTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [countdown, setCountdown] = useState(0)
  const recognitionRef = useRef(null)
  const finalRef = useRef('')
  const silenceTimerRef = useRef(null)
  const countdownRef = useRef(null)
  const noSpeechTimeoutRef = useRef(null)
  const onAutoSubmitRef = useRef(onAutoSubmit)
  const autoSubmitEnabledRef = useRef(autoSubmitEnabled)
  const isSubmittingRef = useRef(false)
  const startAttemptRef = useRef(0)
  const listeningRef = useRef(false)

  useEffect(() => {
    onAutoSubmitRef.current = onAutoSubmit
    autoSubmitEnabledRef.current = autoSubmitEnabled
  }, [onAutoSubmit, autoSubmitEnabled])

  const clearTimers = useCallback(() => {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null }
    if (noSpeechTimeoutRef.current) { clearTimeout(noSpeechTimeoutRef.current); noSpeechTimeoutRef.current = null }
    setCountdown(0)
  }, [])

  const triggerSubmit = useCallback(() => {
    if (isSubmittingRef.current) return
    const text = finalRef.current.trim()
    if (!text) return
    isSubmittingRef.current = true
    clearTimers()
    if (recognitionRef.current) {
      recognitionRef.current._shouldContinue = false
      try { recognitionRef.current.stop() } catch (x) {}
    }
    listeningRef.current = false
    setListening(false)
    if (onAutoSubmitRef.current) onAutoSubmitRef.current(text)
    setTimeout(() => { isSubmittingRef.current = false }, 3000)
  }, [clearTimers])

  const startSilenceCheck = useCallback(() => {
    if (!autoSubmitEnabledRef.current) return
    clearTimers()
    silenceTimerRef.current = setTimeout(() => {
      let c = 3
      setCountdown(c)
      countdownRef.current = setInterval(() => {
        c--
        setCountdown(c)
        if (c <= 0) {
          clearInterval(countdownRef.current)
          countdownRef.current = null
          triggerSubmit()
        }
      }, 1000)
    }, 2500)
  }, [clearTimers, triggerSubmit])

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return
    const r = new SpeechRecognition()
    r.continuous = true
    r.interimResults = true
    r.lang = 'en-US'
    r.maxAlternatives = 1

    r.onresult = (e) => {
      clearTimers()
      let interim = ''
      let gotText = false
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) {
          finalRef.current += t + ' '
          gotText = true
        } else {
          interim += t
          if (t.trim()) gotText = true
        }
      }
      setFinalTranscript(finalRef.current)
      setInterimTranscript(interim)
      if (gotText && !isSubmittingRef.current) startSilenceCheck()
    }

    r.onerror = (e) => {
      if (e.error === 'no-speech') return
      if (e.error === 'not-allowed') { setListening(false); r._shouldContinue = false }
    }

    r.onend = () => {
      if (r._shouldContinue) {
        setTimeout(() => {
          try {
            r.start()
          } catch (x) {
            setListening(false)
            r._shouldContinue = false
          }
        }, 200)
      } else {
        setListening(false)
      }
    }

    recognitionRef.current = r
    return () => { try { r.stop() } catch (x) {} clearTimers() }
  }, [clearTimers, startSilenceCheck])

  const start = useCallback(() => {
    if (!recognitionRef.current) return
    finalRef.current = ''
    setFinalTranscript('')
    setInterimTranscript('')
    clearTimers()
    isSubmittingRef.current = false
    startAttemptRef.current = 0
    const doStart = () => {
      startAttemptRef.current++
      try {
        recognitionRef.current.stop()
      } catch (x) {}
      setTimeout(() => {
        try {
          recognitionRef.current._shouldContinue = true
          recognitionRef.current.start()
          listeningRef.current = true
          setListening(true)
          noSpeechTimeoutRef.current = setTimeout(() => {
            if (listeningRef.current && !isSubmittingRef.current) {
              triggerSubmit()
            }
          }, 10000)
        } catch (x) {
          if (startAttemptRef.current < 5) {
            setTimeout(doStart, 300)
          } else {
            listeningRef.current = false
            setListening(false)
          }
        }
      }, 150)
    }
    doStart()
  }, [clearTimers, triggerSubmit])

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current._shouldContinue = false
      try { recognitionRef.current.stop() } catch (x) {}
    }
    listeningRef.current = false
    setListening(false)
    clearTimers()
  }, [clearTimers])

  return {
    listening, finalTranscript, countdown,
    fullTranscript: finalTranscript + interimTranscript,
    startListening: start, stopListening: stop,
    supported: !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  }
}

// ═══════════ CAMERA RECORDING HOOK ═══════════
function useCameraRecording() {
  const [recording, setRecording] = useState(false)
  const [videoBlob, setVideoBlob] = useState(null)
  const [cameraActive, setCameraActive] = useState(false)
  const streamRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      streamRef.current = stream
      setCameraActive(true)
      return stream
    } catch (err) { return null }
  }, [])

  const stopCamera = useCallback(() => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    setCameraActive(false)
  }, [])

  const startRecording = useCallback(async () => {
    const stream = streamRef.current || await startCamera()
    if (!stream) return
    chunksRef.current = []; setVideoBlob(null)
    const mr = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' })
    mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    mr.onstop = () => { setVideoBlob(new Blob(chunksRef.current, { type: 'video/webm' })); setRecording(false) }
    mediaRecorderRef.current = mr; mr.start(1000); setRecording(true)
  }, [startCamera])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop()
  }, [])

  return { recording, videoBlob, cameraActive, streamRef, startCamera, stopCamera, startRecording, stopRecording, supported: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) }
}

// ═══════════ FACE DETECTION ANTI-CHEAT HOOK ═══════════
function useFaceDetection(streamRef, enabled) {
  const [faceWarning, setFaceWarning] = useState('')
  const [violationCount, setViolationCount] = useState(0)
  const [faceStatus, setFaceStatus] = useState('loading')
  const noFaceTimerRef = useRef(null)
  const intervalRef = useRef(null)
  const modelsReadyRef = useRef(false)
  const prevFaceRef = useRef(null)
  const lastViolationRef = useRef(0)

  useEffect(() => {
    if (!enabled || !streamRef.current) { setFaceStatus('ok'); return }
    if (typeof window === 'undefined' || !window.faceapi) { setFaceStatus('ok'); return }
    const faceapi = window.faceapi
    let cancelled = false
    const video = document.createElement('video')
    video.muted = true; video.playsInline = true; video.width = 320; video.height = 240
    video.srcObject = streamRef.current; video.play().catch(() => {})
    prevFaceRef.current = null
    setTimeout(() => { if (!modelsReadyRef.current && !cancelled) setFaceStatus('ok') }, 8000)
    const loadModels = async () => {
      try {
        const modelUrl = 'https://justadudewhohacks.github.io/face-api.js/models'
        await faceapi.nets.tinyFaceDetector.loadFromUri(modelUrl)
        await faceapi.nets.faceLandmark68Net.loadFromUri(modelUrl)
        if (!cancelled) { modelsReadyRef.current = true; setFaceStatus('ok') }
      } catch (err) {
        console.warn('Failed to load face detection models:', err)
        if (!cancelled) setFaceStatus('failed')
      }
    }
    loadModels()
    const detectFace = async () => {
      if (cancelled || !modelsReadyRef.current || video.readyState < 2) return
      try {
        const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.5 })
        const result = await faceapi.detectSingleFace(video, opts).withFaceLandmarks()
        if (!result) {
          if (!noFaceTimerRef.current) {
            noFaceTimerRef.current = setTimeout(() => {
              if (!cancelled && Date.now() - lastViolationRef.current > 1600) {
                lastViolationRef.current = Date.now(); setFaceStatus('violation')
                setFaceWarning('Face not detected — stay in front of camera')
                setViolationCount(c => c + 1)
              }
            }, 3000)
          }
          return
        }
        if (noFaceTimerRef.current) { clearTimeout(noFaceTimerRef.current); noFaceTimerRef.current = null }
        const box = result.detection.box; const landmarks = result.landmarks
        const w = video.videoWidth || 320; const h = video.videoHeight || 240
        const faceCenterX = box.x + box.width / 2; const faceCenterY = box.y + box.height / 2
        const offsetRatio = Math.abs(faceCenterX - w / 2) / w
        const leftEye = landmarks.getLeftEye(); const rightEye = landmarks.getRightEye()
        const leftEyeY = leftEye.reduce((s, p) => s + p.y, 0) / leftEye.length
        const rightEyeY = rightEye.reduce((s, p) => s + p.y, 0) / rightEye.length
        const eyeTilt = Math.abs(leftEyeY - rightEyeY) / box.height
        const nose = landmarks.getNose(); const noseTip = nose[nose.length - 1]
        const eyeAvgY = (leftEyeY + rightEyeY) / 2
        const noseDrop = (noseTip.y - eyeAvgY) / box.height
        let isMoving = false
        if (prevFaceRef.current) {
          const p = prevFaceRef.current
          if (Math.abs(faceCenterX - p.x) / w > 0.10 || Math.abs(faceCenterY - p.y) / h > 0.10) isMoving = true
        }
        prevFaceRef.current = { x: faceCenterX, y: faceCenterY }
        const now = Date.now(); const canInc = now - lastViolationRef.current > 1600
        if (offsetRatio > 0.22 && canInc) { lastViolationRef.current = now; setFaceStatus('warning'); setFaceWarning('Face off-center — look at the camera'); setViolationCount(c => c + 1) }
        else if (eyeTilt > 0.06 && canInc) { lastViolationRef.current = now; setFaceStatus('warning'); setFaceWarning('Head tilted — face the camera straight'); setViolationCount(c => c + 1) }
        else if (noseDrop > 0.38 && canInc) { lastViolationRef.current = now; setFaceStatus('warning'); setFaceWarning('Looking down — keep eyes on screen'); setViolationCount(c => c + 1) }
        else if (isMoving && canInc) { lastViolationRef.current = now; setFaceStatus('warning'); setFaceWarning('Face moved — keep still'); setViolationCount(c => c + 1) }
        else { setFaceStatus('ok'); setFaceWarning('') }
      } catch (e) {}
    }
    setTimeout(() => { if (!cancelled) { detectFace(); intervalRef.current = setInterval(detectFace, 1800) } }, 3000)
    return () => { cancelled = true; if (intervalRef.current) clearInterval(intervalRef.current); if (noFaceTimerRef.current) clearTimeout(noFaceTimerRef.current); video.pause(); video.srcObject = null }
  }, [enabled, streamRef])

  return { faceWarning, violationCount, faceStatus }
}

// ═══════════ MAIN APP ═══════════
export default function App() {
  const [page, setPage] = useState('login')
  const [user, setUser] = useState(null)
  const [interviews, setInterviews] = useState([])
  const [pastSessions, setPastSessions] = useState([])
  const [allSessions, setAllSessions] = useState([])
  const [sharedReports, setSharedReports] = useState([])
  const [session, setSession] = useState(null)
  const [selectedInterview, setSelectedInterview] = useState(null)
  const [transcript, setTranscript] = useState([])
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [qCount, setQCount] = useState(0)
  const [phase, setPhase] = useState('idle')
  const [isAdmin, setIsAdmin] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [typedAnswer, setTypedAnswer] = useState('')
  const [error, setError] = useState('')
  const [availableModels, setAvailableModels] = useState([])
  const [selectedModel, setSelectedModel] = useState('')
  const [modelUsed, setModelUsed] = useState('')
  const [shareLink, setShareLink] = useState('')
  const [adminStats, setAdminStats] = useState(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [resumeData, setResumeData] = useState(null)
  const [resumeUploading, setResumeUploading] = useState(false)
  const [resumeError, setResumeError] = useState('')
  const [showResumeUpload, setShowResumeUpload] = useState(false)
  const [showTranscript, setShowTranscript] = useState(false)
  const endInterviewRef = useRef(null)
  const recRef = useRef(null)
  const currentAudioRef = useRef(null)
  const isFetchingRef = useRef(false)
  const submitLockRef = useRef(false)
  const transcriptRef = useRef([])
  const speakLockRef = useRef(false)

  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else document.documentElement.requestFullscreen()
  }

  const doLogin = async (e, isAdminLogin = false) => {
    e.preventDefault()
    const { email, password } = e.target
    setError(''); setLoading(true)
    try {
      const res = await api.post('/api/users/login', { email: email.value, password: password.value })
      const { token, user: u } = res.data
      if (isAdminLogin && u.role !== 'admin') { setError('Access denied. Admin account required.'); setLoading(false); return }
      localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify(u))
      setUser(u); setIsAdmin(u.role === 'admin')
      if (isAdminLogin || u.role === 'admin') { setPage('admin'); loadAdmin(); loadModels() }
      else { setPage('dashboard'); loadDashboard(); loadModels() }
    } catch (err) { setError(err.response?.data?.message || 'Login failed') }
    finally { setLoading(false) }
  }

  const doRegister = async (e) => {
    e.preventDefault()
    const { name, email, password } = e.target
    setError(''); setLoading(true)
    try {
      const res = await api.post('/api/users/register', { name: name.value, email: email.value, password: password.value })
      const { token, user: u } = res.data
      localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify(u))
      setUser(u); setIsAdmin(u.role === 'admin'); setPage('dashboard'); loadDashboard(); loadModels()
    } catch (err) { setError(err.response?.data?.message || 'Registration failed') }
    finally { setLoading(false) }
  }

  const doLogout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); setUser(null); setPage('login') }

  const loadModels = async () => {
    try { const r = await api.get('/api/ai/models'); setAvailableModels(r.data.available || []); setSelectedModel(r.data.default_model || r.data.available?.[0]?.id || '') } catch (e) {}
  }

  const loadDashboard = async () => {
    try {
      const [iRes, sRes] = await Promise.all([api.get('/api/interviews'), api.get('/api/sessions')])
      setInterviews(iRes.data)
      const uid = user?._id || JSON.parse(localStorage.getItem('user') || '{}')._id
      setPastSessions(uid ? sRes.data.filter(s => s.userId === uid || s.userId?._id === uid) : [])
      setAllSessions(sRes.data)
    } catch (e) {}
  }

  const loadAdmin = async () => {
    try {
      const [iRes, sRes, shRes, stRes] = await Promise.all([
        api.get('/api/interviews'), api.get('/api/sessions'),
        api.get('/api/sessions/shared').catch(() => ({ data: [] })),
        api.get('/api/admin/stats').catch(() => ({ data: null }))
      ])
      setInterviews(iRes.data); setAllSessions(sRes.data); setSharedReports(shRes.data); setAdminStats(stRes.data)
    } catch (e) {}
  }

  const handleResumeUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setResumeUploading(true); setResumeError(''); setResumeData(null)
    try {
      const formData = new FormData(); formData.append('resume', file)
      const res = await api.post('/api/resume/analyze', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      if (res.data.success) { setResumeData(res.data.resumeData); setShowResumeUpload(false) }
      else setResumeError(res.data.message || 'Failed to analyze resume')
    } catch (err) { setResumeError(err.response?.data?.message || 'Upload failed.') }
    finally { setResumeUploading(false) }
  }

  const clearResume = () => { setResumeData(null); setResumeError('') }

  const saveEntry = async (role, text) => {
    if (!session?._id) return
    try { await api.put(`/api/sessions/${session._id}/transcript`, { role, text }) } catch (e) {}
  }

  const speakQuestion = async (text) => {
    if (speakLockRef.current) return
    speakLockRef.current = true
    setPhase('ai-speaking')
    if (currentAudioRef.current) { currentAudioRef.current.pause(); currentAudioRef.current = null }
    window.speechSynthesis?.cancel()
    if (recRef.current) recRef.current.stopListening()
    const pauseThenListen = () => {
      setPhase('waiting')
      setTimeout(() => {
        speakLockRef.current = false
        setPhase('user-speaking')
        if (recRef.current) recRef.current.startListening()
      }, 1500)
    }
    try {
      const res = await api.post('/api/ai/tts', { text, voice: 'Eve' }, { responseType: 'blob' })
      if (res.data && res.data.fallback) {
        if ('speechSynthesis' in window) {
          const u = new SpeechSynthesisUtterance(text); u.rate = 0.95; u.pitch = 1
          u.onend = pauseThenListen; u.onerror = pauseThenListen
          window.speechSynthesis.speak(u)
        } else pauseThenListen()
        return
      }
      const blob = res.data; const url = URL.createObjectURL(blob)
      const audio = new Audio(url); currentAudioRef.current = audio
      audio.onended = () => { URL.revokeObjectURL(url); currentAudioRef.current = null; pauseThenListen() }
      audio.onerror = () => { URL.revokeObjectURL(url); currentAudioRef.current = null; pauseThenListen() }
      await audio.play()
    } catch (e) {
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(text); u.rate = 0.95; u.pitch = 1
        u.onend = pauseThenListen; u.onerror = pauseThenListen
        window.speechSynthesis.speak(u)
      } else pauseThenListen()
    }
  }

  const getFirstQuestion = useCallback(async (interview) => {
    setLoading(true); setPhase('processing')
    try {
      const res = await api.post('/api/ai/next-question', { transcript: [], interviewCategory: interview?.category || 'tech', currentQuestionIndex: 0, model: selectedModel, resumeData: resumeData || null })
      const q = res.data.question
      setQuestion(q); setModelUsed(res.data.modelUsed || '')
      const entry = { role: 'interviewer', text: q, timestamp: new Date() }
      setTranscript([entry]); transcriptRef.current = [entry]
      saveEntry('interviewer', q)
      speakQuestion(q)
    } catch (err) {
      const q = 'Welcome to the interview. Please tell me about yourself.'
      const entry = { role: 'interviewer', text: q, timestamp: new Date() }
      setQuestion(q); setTranscript([entry]); transcriptRef.current = [entry]
      speakQuestion(q)
    } finally { setLoading(false) }
  }, [selectedModel, resumeData])

  const getNextQuestion = useCallback(async (count) => {
    if (isFetchingRef.current) return
    isFetchingRef.current = true
    setPhase('processing')
    try {
      const currentTranscript = transcriptRef.current
      const res = await api.post('/api/ai/next-question', {
        transcript: currentTranscript,
        interviewCategory: selectedInterview?.category || 'tech',
        currentQuestionIndex: count,
        model: selectedModel,
        resumeData: resumeData || null
      })
      const q = res.data.question
      if (!q) { isFetchingRef.current = false; if (res.data.done) setTimeout(() => endInterviewRef.current?.(), 500); return }
      setQuestion(q)
      if (res.data.modelUsed) setModelUsed(res.data.modelUsed)
      const entry = { role: 'interviewer', text: q, timestamp: new Date() }
      setTranscript(prev => { const updated = [...prev, entry]; transcriptRef.current = updated; return updated })
      saveEntry('interviewer', q)
      speakQuestion(q)
    } catch (err) {
      setQuestion('Could you tell me more about that?')
    } finally {
      isFetchingRef.current = false
    }
  }, [selectedInterview, selectedModel, resumeData])

  // Auto-fetch next question when count increments
  useEffect(() => {
    if (qCount > 0 && page === 'interview') getNextQuestion(qCount)
  }, [qCount, page, getNextQuestion])

  const submitAnswerText = useCallback((answer) => {
    if (!answer?.trim() || submitLockRef.current) return
    submitLockRef.current = true
    if (recRef.current) recRef.current.stopListening()
    setPhase('processing')
    const trimmed = answer.trim()
    const entry = { role: 'candidate', text: trimmed, timestamp: new Date() }
    setTranscript(prev => { const updated = [...prev, entry]; transcriptRef.current = updated; return updated })
    saveEntry('candidate', trimmed)
    setQCount(prev => prev + 1)
    setTimeout(() => { submitLockRef.current = false }, 800)
  }, [])

  const handleAutoSubmit = useCallback((text) => { if (text?.trim() && !submitLockRef.current) submitAnswerText(text) }, [submitAnswerText])
  const rec = useSpeechRecognition({ onAutoSubmit: handleAutoSubmit, autoSubmitEnabled: true })
  useEffect(() => { recRef.current = rec }, [rec])

  const startInterview = async (interview) => {
    setLoading(true); setSelectedInterview(interview)
    isFetchingRef.current = false
    submitLockRef.current = false
    speakLockRef.current = false
    transcriptRef.current = []
    try {
      const uid = user?._id || JSON.parse(localStorage.getItem('user') || '{}')._id
      const res = await api.post('/api/sessions', { userId: uid, interviewId: interview._id, resumeData: resumeData || null })
      setSession(res.data.session); setTranscript([]); setQCount(0); setModelUsed(''); setShareLink('')
      setCameraOn(true)
      const stream = await cam.startCamera()
      if (!stream) { alert('Camera access is required.'); setLoading(false); setCameraOn(false); return }
      cam.startRecording(); setPage('interview')
      if (document.fullscreenEnabled) document.documentElement.requestFullscreen().catch(() => {})
      await getFirstQuestion(interview)
    } catch (err) { alert('Error: ' + (err.response?.data?.message || err.message)); setLoading(false) }
  }

  const endInterview = async () => {
    isFetchingRef.current = false
    submitLockRef.current = false
    speakLockRef.current = false
    if (recRef.current) recRef.current.stopListening()
    window.speechSynthesis?.cancel()
    if (currentAudioRef.current) { currentAudioRef.current.pause(); currentAudioRef.current = null }
    cam.stopCamera()
    if (cam.recording) cam.stopRecording()
    setCameraOn(false)
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    const pending = recRef.current?.finalTranscript?.trim()
    let finalTr = transcriptRef.current
    if (pending) { finalTr = [...finalTr, { role: 'candidate', text: pending, timestamp: new Date() }]; setTranscript(finalTr); transcriptRef.current = finalTr; saveEntry('candidate', pending) }
    setPage('results'); setPhase('processing'); setFeedbackLoading(true); setLoading(false)
    try {
      const res = await api.post('/api/ai/feedback', { transcript: finalTr, interviewCategory: selectedInterview?.category || 'tech', model: selectedModel })
      if (res.data.modelUsed) setModelUsed(res.data.modelUsed)
      if (session?._id) {
        await api.put(`/api/sessions/${session._id}/feedback`, { feedback: res.data.feedback, score: res.data.score })
        if (cam.videoBlob) {
          const reader = new FileReader()
          reader.onload = async () => { try { await api.put(`/api/sessions/${session._id}/video`, { videoUrl: reader.result }) } catch (e) {} }
          reader.readAsDataURL(cam.videoBlob)
        }
      }
      setSession(prev => ({ ...prev, feedback: res.data.feedback, score: res.data.score, videoUrl: cam.videoBlob ? URL.createObjectURL(cam.videoBlob) : null }))
    } catch (err) { alert('Feedback error: ' + (err.response?.data?.message || err.message)) }
    finally { setFeedbackLoading(false); setPhase('idle') }
  }
  endInterviewRef.current = endInterview

  const shareReport = async () => {
    if (!session?._id) return
    try {
      const res = await api.put(`/api/sessions/${session._id}/share`)
      const link = `${window.location.origin}?report=${session._id}`
      setShareLink(link)
      try { await navigator.clipboard.writeText(link) } catch (x) {}
      alert('Report shared. Link copied to clipboard.')
      setSession(res.data.session)
    } catch (err) { alert('Error sharing: ' + err.message) }
  }

  const downloadReport = () => {
    const fb = session?.feedback
    const h = `<!DOCTYPE html><html><head><title>Interview Report</title><meta charset="utf-8"><style>body{font-family:Segoe UI,sans-serif;max-width:800px;margin:40px auto;padding:20px;color:#333}h1{color:#2563eb;border-bottom:2px solid #2563eb;padding-bottom:10px}h2{color:#555;margin-top:30px}.score-box{background:linear-gradient(135deg,#2563eb,#7c3aed);color:white;padding:30px;border-radius:8px;text-align:center;margin:20px 0}.score-box .s{font-size:64px;font-weight:bold}.fb{background:#f8f9fa;padding:20px;border-radius:8px;margin:10px 0;border-left:4px solid #2563ea}.te{padding:12px;margin:8px 0;border-radius:8px}.in{background:#e3f2fd;border-left:4px solid #2196f3}.ca{background:#f3e5f5;border-left:4px solid #9c27b0}.ro{font-weight:bold}.footer{margin-top:40px;text-align:center;color:#999;font-size:12px}</style></head><body><h1>Interview Report</h1><p>Date: ${new Date().toLocaleDateString()}</p><p>Candidate: ${user?.name||'N/A'}</p><p>Interview: ${selectedInterview?.title||'N/A'}</p><div class="score-box"><div class="s">${session?.score||'N/A'}</div><div class="l">out of 10</div></div>${fb?`<h2>Feedback</h2><div class="fb"><h3>Strengths</h3><p>${fb.strengths||''}</p></div><div class="fb"><h3>Areas for Improvement</h3><p>${fb.weaknesses||''}</p></div><div class="fb"><h3>Overall Assessment</h3><p>${fb.overallAssessment||''}</p></div>`:''}<h2>Transcript</h2>${transcript.map(e=>`<div class="te ${e.role==='interviewer'?'in':'ca'}"><span class="ro">${e.role==='interviewer'?'Interviewer':'Candidate'}:</span> ${e.text}</div>`).join('')}<div class="footer"><p>Generated by Voice Interview Platform</p></div></body></html>`
    const blob = new Blob([h], { type: 'text/html' })
    const u = URL.createObjectURL(blob); const a = document.createElement('a')
    a.href = u; a.download = `interview-report-${new Date().toISOString().split('T')[0]}.html`; a.click(); URL.revokeObjectURL(u)
  }

  const createInterview = async (e) => {
    e.preventDefault()
    const { title, category, questions } = e.target
    try { await api.post('/api/interviews', { title: title.value, category: category.value, questions: questions.value.split('\n').filter(q => q.trim()), createdBy: user._id }); setShowCreate(false); loadAdmin(); alert('Interview created.') }
    catch (err) { alert('Error: ' + err.message) }
  }

  const deleteInterview = async (id) => {
    if (!confirm('Delete this interview?')) return
    try { await api.delete(`/api/interviews/${id}`); loadAdmin() } catch (err) { alert('Error') }
  }

  useEffect(() => {
    const token = localStorage.getItem('token'), saved = localStorage.getItem('user')
    if (token && saved) {
      const u = JSON.parse(saved); setUser(u); setIsAdmin(u.role === 'admin')
      if (u.role === 'admin') { setPage('admin'); loadAdmin() } else { setPage('dashboard'); loadDashboard() }
      loadModels()
    }
  }, [])

  useRippleEffect()
  const pageTransition = useSmoothPage(page)

  const cam = useCameraRecording()
  const face = useFaceDetection(cam.streamRef, cameraOn)
  useEffect(() => { if (face.violationCount >= 3 && page === 'interview' && endInterviewRef.current) endInterviewRef.current() }, [face.violationCount, page])

  // ═══════════ LOGIN ═══════════
  if (page === 'login') {
    return (
      <div className="container">
        <div className="auth-card">
          <div className="auth-logo">VI</div>
          <h1>Voice Interview Platform</h1>
          <p className="subtitle">AI-powered interview assessment</p>
          {error && <div className="error-box">{error}</div>}
          <form onSubmit={doLogin}>
            <input name="email" type="email" placeholder="Email address" required />
            <input name="password" type="password" placeholder="Password" required />
            <button type="submit" disabled={loading}>{loading?'Logging in...':'Sign In'}</button>
          </form>
          <p className="switch-link">No account? <a href="#register" onClick={e=>{e.preventDefault();setPage('register');setError('')}}>Create one</a></p>
          <div className="login-options">
            <button className="btn-admin-login" onClick={()=>{setPage('admin-login');setError('')}}>Admin Access</button>
          </div>
          <p className="quick-login">Demo: <span onClick={async()=>{const r=await api.post('/api/users/login',{email:'demo@example.com',password:'demo123'});localStorage.setItem('token',r.data.token);localStorage.setItem('user',JSON.stringify(r.data.user));setUser(r.data.user);setIsAdmin(false);setPage('dashboard');loadDashboard();loadModels()}}>demo@example.com / demo123</span></p>
          {!rec.supported && <p className="warning">Chrome recommended for speech recognition</p>}
        </div>
      </div>
    )
  }

  if (page === 'admin-login') {
    return (
      <div className="container">
        <div className="auth-card admin-auth">
          <div className="auth-logo">A</div>
          <h1>Admin Access</h1>
          <p className="subtitle">Authorized personnel only</p>
          {error && <div className="error-box">{error}</div>}
          <form onSubmit={e => doLogin(e, true)}>
            <input name="email" type="email" placeholder="Admin email" required />
            <input name="password" type="password" placeholder="Admin password" required />
            <button type="submit" disabled={loading}>{loading?'Verifying...':'Sign In'}</button>
          </form>
          <p className="switch-link"><a href="#login" onClick={e=>{e.preventDefault();setPage('login');setError('')}}>Back to login</a></p>
        </div>
      </div>
    )
  }

  if (page === 'register') {
    return (
      <div className="container">
        <div className="auth-card">
          <div className="auth-logo">VI</div>
          <h1>Create Account</h1>
          <p className="subtitle">Start your interview practice</p>
          {error && <div className="error-box">{error}</div>}
          <form onSubmit={doRegister}>
            <input name="name" placeholder="Full name" required />
            <input name="email" type="email" placeholder="Email address" required />
            <input name="password" type="password" placeholder="Password (min 6 chars)" required minLength={6} />
            <button type="submit" disabled={loading}>{loading?'Creating...':'Create Account'}</button>
          </form>
          <p className="switch-link">Have an account? <a href="#login" onClick={e=>{e.preventDefault();setPage('login');setError('')}}>Sign in</a></p>
        </div>
      </div>
    )
  }

  // ═══════════ DASHBOARD ═══════════
  if (page === 'dashboard') {
    const catLabels = { tech: 'Technical', HR: 'HR', coding: 'Coding' }
    return (
      <div className="container">
        <div className="header">
          <div><h1>Welcome, {user?.name}</h1><p className="header-sub">Select an interview to begin</p></div>
          <div className="header-actions"><button className="btn-outline" onClick={doLogout}>Sign Out</button></div>
        </div>
        {availableModels.length > 0 && (
          <div className="model-bar">
            <span className="model-bar-label">AI Services:</span>
            {availableModels.map((m, i) => <span key={m.id} className={`model-chip ${m.connected?'connected':'offline'}`}>{m.connected ? 'Online' : 'Offline'}</span>)}
          </div>
        )}
        <div className="card">
          <div className="card-header"><h2>Resume-Based Interview</h2><button className="btn-add" onClick={() => setShowResumeUpload(!showResumeUpload)}>{showResumeUpload ? 'Cancel' : 'Upload Resume'}</button></div>
          {resumeData && (
            <div className="resume-preview">
              <div className="resume-preview-header"><span className="resume-badge">Resume loaded</span><button className="btn-clear-resume" onClick={clearResume}>Remove</button></div>
              {resumeData.summary && <p className="resume-summary">{resumeData.summary}</p>}
              {resumeData.skills?.length > 0 && (<div className="resume-skills"><span>Skills:</span><div className="skill-tags">{resumeData.skills.map((s, i) => <span key={i} className="skill-tag">{s}</span>)}</div></div>)}
              {resumeData.experience && <p className="resume-exp">{resumeData.experience}</p>}
              {resumeData.education && <p className="resume-edu">{resumeData.education}</p>}
            </div>
          )}
          {showResumeUpload && (
            <div className="resume-upload-area">
              <input type="file" id="resume-file" accept=".pdf,.docx,.txt" onChange={handleResumeUpload} disabled={resumeUploading} />
              <label htmlFor="resume-file" className="resume-file-label">{resumeUploading ? 'Analyzing...' : 'Upload PDF, DOCX, or TXT'}</label>
              {resumeError && <p className="error-box">{resumeError}</p>}
              <p className="upload-hint">AI will analyze your resume to generate personalized questions.</p>
            </div>
          )}
          {!resumeData && !showResumeUpload && <p className="resume-placeholder">Upload your resume for personalized interview questions.</p>}
        </div>
        <div className="card">
          <h2>Interviews</h2>
          <div className="interview-grid">
            {interviews.length===0?<p className="empty">Loading...</p>:interviews.map(i=>(
              <div key={i._id} className="interview-card">
                <span className={`badge badge-${i.category}`}>{catLabels[i.category]||i.category}</span>
                <h3>{i.title}</h3>
                <p className="question-count">{i.questions?.length||0} questions</p>
                <button onClick={()=>startInterview(i)} disabled={loading}>{loading?'Starting...':'Start'}</button>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h2>Past Sessions</h2>
          {pastSessions.length===0?<p className="empty">No sessions yet.</p>:(
            <div className="sessions-list">
              {pastSessions.map(s=>(
                <div key={s._id} className="session-item" onClick={()=>{setSession(s);setTranscript(s.transcript||[]);setSelectedInterview(s.interviewId&&typeof s.interviewId==='object'?s.interviewId:null);setShareLink('');setPage('results')}}>
                  <div className="session-info"><h4>{s.interviewId?.title||'Interview'}</h4><span className={`status status-${s.status}`}>{s.status==='completed'?'Completed':'In Progress'}</span></div>
                  <div className="session-meta">{s.score!=null?<span className="score-badge">{s.score}/10</span>:<span className="score-badge pending">Pending</span>}<span className="date">{new Date(s.createdAt).toLocaleDateString()}</span></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ═══════════ INTERVIEW ═══════════
  if (page === 'interview') {
    return (
      <div className={`interview-fullscreen${fullscreen?' active':''}`}>
        {cameraOn && cam.cameraActive && (
          <video ref={el => { if (el && cam.streamRef.current && !el.srcObject) el.srcObject = cam.streamRef.current; el?.play().catch(()=>{}) }} autoPlay muted playsInline className="camera-bg-video" />
        )}
        <div className="camera-bg-overlay"></div>

        <div className="interview-topbar-fs">
          <button className="btn-back-sm" onClick={()=>{if(recRef.current)recRef.current.stopListening();window.speechSynthesis?.cancel();if(currentAudioRef.current){currentAudioRef.current.pause();currentAudioRef.current=null}cam.stopCamera();if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});setPage('dashboard');loadDashboard()}}>Exit</button>
          <div className="interview-meta-center">
            <span className="interview-title-badge">{selectedInterview?.title||'Interview'}</span>
            <span className="interview-cat-badge">{selectedInterview?.category||'tech'}</span>
            <span className="q-counter-badge">Q{qCount+1} / 10</span>
          </div>
          <div className="topbar-right">
            <button className={`btn-fullscreen ${fullscreen?'active':''}`} onClick={toggleFullscreen}>{fullscreen ? 'Exit' : 'Fullscreen'}</button>
            {cam.supported && (<button className={`btn-camera-toggle ${cameraOn?'active':''}`} onClick={()=>{if(cameraOn){cam.stopCamera();if(cam.recording)cam.stopRecording();setCameraOn(false)}else{cam.startCamera();setCameraOn(true)}}}>{cameraOn ? 'REC' : 'Camera'}</button>)}
            <div className="model-selector"><select value={selectedModel} onChange={e=>setSelectedModel(e.target.value)}>{availableModels.filter(m=>m.connected).map((m,i)=><option key={m.id} value={m.id}>AI {i+1}</option>)}</select></div>
          </div>
        </div>

        <div className="interview-status-bar">
          {cameraOn && (
            <>
              <div className="status-item">
                <span className={`status-dot-indicator ${face.faceStatus==='ok'?'':face.faceStatus==='violation'?'error':face.faceStatus==='warning'?'warning':face.faceStatus==='loading'?'inactive':'inactive'}`}></span>
                <span>Proctor: {face.faceStatus.toUpperCase()}</span>
              </div>
              {face.violationCount > 0 && <div className="status-item"><span className="status-dot-indicator error"></span>Warnings: {face.violationCount}/3</div>}
            </>
          )}
          <div className="status-item">
            <span className={`status-dot-indicator ${phase==='user-speaking'&&rec.listening?'':'inactive'}`}></span>
            <span>{phase==='ai-speaking'?'AI SPEAKING':phase==='waiting'?'READY':phase==='user-speaking'&&rec.listening?'LISTENING':phase==='processing'?'PROCESSING':`Q${qCount+1}/10`}</span>
          </div>
          <div className="status-item"><span className="status-dot-indicator inactive"></span>{qCount===0?'WARM UP':qCount<=2?'SKILLS':qCount<=4?'EXPERIENCE':qCount<=6?'PROBLEMS':qCount<=8?'BEHAVIORAL':'CLOSING'}</div>
        </div>
        {cameraOn && face.faceWarning && (
          <div className={`proctor-warning level-${Math.min(3, face.violationCount)}`}>⚠ {face.faceWarning}</div>
        )}

        <div className="interview-center-content">
          <div className="phase-label">
            {phase==='ai-speaking'?'AI SPEAKING':phase==='waiting'?'GET READY TO ANSWER':phase==='user-speaking'?(rec.listening?'YOU ARE SPEAKING':'READY'):phase==='processing'?'PROCESSING':`QUESTION ${qCount+1}`}
          </div>

          <div className={`question-card-fs ${phase==='ai-speaking'?'ai-speaking':phase==='user-speaking'?'listening':''}`}>
            <p className="question-text-fs">{question}</p>
          </div>

          <div className="answer-area-fs">
            {phase==='waiting' && (
              <div className="mic-indicator-fs waiting">
                <div className="mic-icon-fs">⏎</div>
                <span className="mic-text-fs empty">You can start answering anytime</span>
                <span className="mic-status-label">Ready</span>
              </div>
            )}
            {(phase==='user-speaking' || phase==='ai-speaking') && rec.supported && (
              <div className={`mic-indicator-fs ${phase==='ai-speaking'?'':'active'}`}>
                <div className="mic-icon-fs">{phase==='ai-speaking'?'♪':'🎤'}</div>
                <span className={`mic-text-fs ${!rec.fullTranscript?'empty':''}`}>
                  {rec.fullTranscript || (phase==='ai-speaking' ? 'Interviewer is speaking...' : (rec.listening ? 'Listening...' : ''))}
                </span>
                {rec.countdown > 0 && <span className="mic-countdown-fs">{rec.countdown}s</span>}
                <span className="mic-status-label">{phase==='ai-speaking'?'AI':rec.listening?'LIVE':''}</span>
                {rec.countdown > 0 && (
                  <div className="countdown-bar-fs" style={{position:'absolute',bottom:0,left:0,right:0}}>
                    <div className="countdown-fill-fs" style={{width: `${(rec.countdown/3)*100}%`}}></div>
                  </div>
                )}
              </div>
            )}
            <div className="fallback-input-fs">
              <textarea placeholder="Type your answer or wait for speech..." value={typedAnswer} onChange={e=>setTypedAnswer(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();if(typedAnswer.trim())submitAnswerText(typedAnswer)}}} />
              <button className="btn-submit-answer" onClick={()=>{if(typedAnswer.trim())submitAnswerText(typedAnswer)}}>Send</button>
            </div>
            {phase==='ai-speaking' && !rec.fullTranscript && <div className="ai-speaking-hint-fs"><div className="sound-waves"><span></span><span></span><span></span><span></span><span></span></div></div>}
            {phase==='processing' && <div className="processing-hint-fs"><div className="spinner-fs"></div></div>}
          </div>
        </div>

        <div className="interview-progress-bar">
          <div className="interview-progress-fill" style={{width:`${((qCount+1)/10)*100}%`}}></div>
        </div>
        <div className="interview-bottom-bar">
          <button className="btn-transcript-toggle" onClick={()=>{setShowTranscript(!showTranscript)}}>{showTranscript ? 'HIDE' : 'TRANSCRIPT'}</button>
          <button className="btn-end-fs" onClick={endInterview} disabled={loading}>{loading?'ENDING...':'END INTERVIEW'}</button>
        </div>

        {showTranscript && (
          <div className="transcript-panel">
            <div className="transcript-panel-header">
              <h3>Conversation</h3>
              <button className="btn-close-transcript" onClick={()=>setShowTranscript(false)}>Close</button>
            </div>
            <div className="transcript-panel-scroll">
              {transcript.length===0?<p className="empty">Starting...</p>:transcript.map((e,i)=>(<div key={i} className={`transcript-entry ${e.role}`}><span className="entry-icon">{e.role==='interviewer'?'A':'Q'}</span><div className="entry-content"><span className="entry-role">{e.role==='interviewer'?'Interviewer':'Candidate'}</span><p>{e.text}</p></div></div>))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ═══════════ RESULTS ═══════════
  if (page === 'results') {
    const fb = session?.feedback
    return (
      <div className="container">
        <div className="card results">
          <div className="results-header"><h1>Interview Report</h1><div className="results-header-actions"><button className="btn-share" onClick={shareReport}>{session?.shared?'Shared':'Share'}</button><button className="btn-download" onClick={downloadReport}>Download</button></div></div>
          {shareLink && <div className="share-link-box"><span>Link:</span><code>{shareLink}</code><button className="btn-copy" onClick={()=>{navigator.clipboard.writeText(shareLink);alert('Copied')}}>Copy</button></div>}
          {selectedInterview && <p className="results-interview-info">{selectedInterview.title} — {selectedInterview.category}</p>}
          {session?.videoUrl && (<div className="video-playback"><h3>Recording</h3><video src={session.videoUrl} controls className="playback-video" /></div>)}
          <div className="score-section"><div className="score-circle"><span className="score-number">{session?.score||'—'}</span><span className="score-total">/10</span></div><p className="score-label">Score</p></div>
          {feedbackLoading && !fb && (<div className="feedback-loading"><div className="spinner"></div><p>Analyzing...</p></div>)}
          {fb && <div className="feedback-grid"><div className="feedback-card strength"><h3>Strengths</h3><p>{fb.strengths}</p></div><div className="feedback-card weakness"><h3>Improvements</h3><p>{fb.weaknesses}</p></div><div className="feedback-card assessment"><h3>Assessment</h3><p>{fb.overallAssessment}</p></div></div>}
          <div className="transcript-full"><h3>Transcript</h3>{transcript.map((e,i)=>(<div key={i} className={`transcript-entry ${e.role}`}><span className="entry-icon">{e.role==='interviewer'?'A':'Q'}</span><div className="entry-content"><span className="entry-role">{e.role==='interviewer'?'Interviewer':'Candidate'}</span><p>{e.text}</p></div></div>))}</div>
          <button className="btn-back" onClick={()=>{setPage('dashboard');loadDashboard()}}>Back to Dashboard</button>
        </div>
      </div>
    )
  }

  // ═══════════ ADMIN PANEL ═══════════
  if (page === 'admin') {
    const s = adminStats
    return (
      <div className="container admin-container">
        <div className="header"><div><h1>Admin Panel</h1><p className="header-sub">System overview</p></div><div className="header-actions">{isAdmin && <button className="btn-outline" onClick={()=>{setPage('dashboard');loadDashboard()}}>User View</button>}<button className="btn-admin" onClick={doLogout}>Sign Out</button></div></div>
        {s && (<div className="stats-grid"><div className="stat-card"><span className="stat-number">{s.totalUsers||0}</span><span className="stat-label">Users</span></div><div className="stat-card"><span className="stat-number">{s.totalSessions||0}</span><span className="stat-label">Sessions</span></div><div className="stat-card"><span className="stat-number">{s.completedSessions||0}</span><span className="stat-label">Completed</span></div><div className="stat-card"><span className="stat-number">{s.avgScore||'0'}</span><span className="stat-label">Avg Score</span></div><div className="stat-card"><span className="stat-number">{s.completionRate||0}%</span><span className="stat-label">Completion</span></div><div className="stat-card"><span className="stat-number">{s.sharedCount||0}</span><span className="stat-label">Shared</span></div><div className="stat-card"><span className="stat-number">{s.totalInterviews||0}</span><span className="stat-label">Templates</span></div><div className="stat-card"><span className="stat-number">{s.interviewStats?.length||0}</span><span className="stat-label">Active</span></div></div>)}
        {s?.interviewStats?.length > 0 && (<div className="card"><h2>Interview Breakdown</h2><div className="admin-sessions-table"><div className="table-header table-4col"><span>Interview</span><span>Category</span><span>Sessions</span><span>Avg Score</span></div>{s.interviewStats.map((is,i)=>(<div key={i} className="table-row table-4col"><span>{is.title||'Unknown'}</span><span className={`badge badge-${is.category||'tech'}`}>{is.category||'tech'}</span><span>{is.sessions}</span><span className="score-badge">{is.avgScore||'N/A'}/10</span></div>))}</div></div>)}
        {s?.dailyActivity?.length > 0 && (<div className="card"><h2>Last 7 Days</h2><div className="activity-chart">{s.dailyActivity.map((d,i)=>(<div key={i} className="activity-bar-group"><span className="activity-label">{d._id?.slice(5)}</span><div className="activity-bar-wrap"><div className="activity-bar" style={{height:`${Math.max(4,Math.min(100,d.count*15))}px`}}></div></div><span className="activity-value">{d.count}</span></div>))}</div></div>)}
        <div className="card"><div className="card-header"><h2>Manage Interviews</h2><button className="btn-add" onClick={()=>setShowCreate(!showCreate)}>{showCreate?'Cancel':'New'}</button></div>{showCreate && <form className="create-form" onSubmit={createInterview}><input name="title" placeholder="Title" required /><select name="category" required><option value="tech">Technical</option><option value="HR">HR</option><option value="coding">Coding</option></select><textarea name="questions" placeholder="Questions (one per line)" rows="6" required /><button type="submit">Create</button></form>}<div className="admin-interview-list">{interviews.map(i=>(<div key={i._id} className="admin-interview-item"><div className="admin-interview-info"><h4>{i.title}</h4><span className={`badge badge-${i.category}`}>{i.category}</span><span className="question-count">{i.questions?.length||0}</span></div><button className="btn-delete" onClick={()=>deleteInterview(i._id)}>Delete</button></div>))}</div></div>
        <div className="card"><h2>All Sessions</h2>{allSessions.length===0?<p className="empty">No sessions</p>:<div className="admin-sessions-table"><div className="table-header"><span>Date</span><span>User</span><span>Status</span><span>Score</span><span>Resume</span><span>Video</span></div>{allSessions.map(s=>(<div key={s._id} className="table-row"><span>{new Date(s.createdAt).toLocaleDateString()}</span><span>{s.userId?.name||s.userId||'User'}</span><span className={`status status-${s.status}`}>{s.status}</span><span className="score-badge">{s.score||'N/A'}/10</span><span>{s.resumeData?.skills?.length > 0 ? <span className="resume-badge-sm">{s.resumeData.skills.length} skills</span> : '—'}</span><span>{s.videoUrl?'Yes':'—'}</span></div>))}</div>}</div>
        {allSessions.filter(s => s.resumeData?.skills?.length > 0).length > 0 && (<div className="card"><h2>Uploaded Resumes</h2><div className="resume-admin-list">{allSessions.filter(s => s.resumeData?.skills?.length > 0).map(s => (<div key={s._id} className="resume-admin-item"><div className="resume-admin-header"><span className="resume-user">{s.userId?.name || s.userId || 'User'} — {new Date(s.createdAt).toLocaleDateString()}</span><span className={`status status-${s.status}`}>{s.status}</span></div>{s.resumeData.summary && <p className="resume-admin-summary">{s.resumeData.summary}</p>}{s.resumeData.skills?.length > 0 && (<div className="resume-admin-skills"><span>Skills:</span><div className="skill-tags">{s.resumeData.skills.map((skill, i) => <span key={i} className="skill-tag">{skill}</span>)}</div></div>)}{s.resumeData.experience && <p className="resume-admin-exp">{s.resumeData.experience}</p>}{s.resumeData.education && <p className="resume-admin-edu">{s.resumeData.education}</p>}</div>))}</div></div>)}
        {sharedReports.length>0 && <div className="card"><h2>Shared Reports</h2><div className="admin-sessions-table"><div className="table-header table-4col"><span>Date</span><span>User</span><span>Interview</span><span>Score</span></div>{sharedReports.map(s=>(<div key={s._id} className="table-row table-4col"><span>{new Date(s.createdAt).toLocaleDateString()}</span><span>{s.userId?.name||s.userId||'User'}</span><span>{s.interviewId?.title||'N/A'}</span><span className="score-badge">{s.score||'N/A'}/10</span></div>))}</div></div>}
        <div className="card"><h2>AI Services</h2><div className="models-status-grid">{availableModels.map((m,i)=>(<div key={m.id} className={`model-status-card ${m.connected?'online':'offline'}`}><div><strong>Model {i+1}</strong><p className="model-status-desc">{m.connected?'Active':'Unavailable'}</p><span className={`status-dot ${m.connected?'online':'offline'}`}>{m.connected?'Online':'Offline'}</span></div></div>))}</div></div>
      </div>
    )
  }

  return null
}
