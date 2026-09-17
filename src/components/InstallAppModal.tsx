import React, { useState } from 'react';
import { 
  Download, 
  Smartphone, 
  X, 
  Check, 
  Copy, 
  ExternalLink, 
  HelpCircle, 
  ShieldCheck, 
  Layers, 
  Volume2, 
  Tv, 
  Terminal,
  Package,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface InstallAppModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InstallAppModal: React.FC<InstallAppModalProps> = ({ isOpen, onClose }) => {
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [copied, setCopied] = useState(false);
  const [copiedUrlLabel, setCopiedUrlLabel] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'github' | 'direct' | 'apk' | 'capacitor' | 'bg'>('github');

  if (!isOpen) return null;

  // Use clean origin URL if in browser
  const rawUrl = typeof window !== 'undefined' ? window.location.href : '';
  const cleanUrl = typeof window !== 'undefined' ? window.location.origin : 'https://ais-pre-hmzvvqnqani2ncpfjemo3r-716683174894.asia-southeast1.run.app';
  
  // PWABuilder prefilled link for this app
  const pwaBuilderUrl = `https://www.pwabuilder.com?url=${encodeURIComponent(cleanUrl)}`;

  const handleCopyLink = (text: string, label: string) => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(text);
      setCopiedUrlLabel(label);
      setTimeout(() => setCopiedUrlLabel(null), 2500);
    }
  };

  const handleInstallClick = async () => {
    const success = await install();
    if (success) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-xl max-h-[92vh] flex flex-col bg-[#131127] border border-violet-500/30 rounded-2xl shadow-2xl overflow-hidden text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-gradient-to-r from-violet-950/40 via-purple-950/30 to-indigo-950/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-pink-600 flex items-center justify-center shadow-lg shadow-violet-600/30 shrink-0">
              <Package className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
                Hamari App Ki Native Android APK
                {isInstalled && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-medium">
                    Installed
                  </span>
                )}
              </h2>
              <p className="text-xs text-neutral-400">Isi WatchParty & MPV app ko Android phone par install karein</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-white/10 bg-[#0d0c1d] px-4 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab('github')}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 whitespace-nowrap transition-all ${
              activeTab === 'github'
                ? 'border-emerald-500 text-emerald-300'
                : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            1. GitHub Actions APK (Auto Build)
          </button>
          <button
            onClick={() => setActiveTab('direct')}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 whitespace-nowrap transition-all ${
              activeTab === 'direct'
                ? 'border-violet-500 text-violet-300'
                : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            2. Direct WebAPK (Phone Install)
          </button>
          <button
            onClick={() => setActiveTab('apk')}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 whitespace-nowrap transition-all ${
              activeTab === 'apk'
                ? 'border-violet-500 text-violet-300'
                : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            3. PWABuilder .APK
          </button>
          <button
            onClick={() => setActiveTab('capacitor')}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 whitespace-nowrap transition-all ${
              activeTab === 'capacitor'
                ? 'border-violet-500 text-violet-300'
                : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            4. Capacitor / Android Studio
          </button>
          <button
            onClick={() => setActiveTab('bg')}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 whitespace-nowrap transition-all ${
              activeTab === 'bg'
                ? 'border-violet-500 text-violet-300'
                : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            <Volume2 className="w-3.5 h-3.5" />
            5. Background YouTube & MPV
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs leading-relaxed text-neutral-300">
          
          {/* TAB 0: GITHUB ACTIONS APK BUILD */}
          {activeTab === 'github' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950/50 via-teal-950/40 to-purple-950/40 border border-emerald-500/40 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-emerald-400" />
                    <h3 className="text-sm font-bold text-white">GitHub Actions CI/CD Se Direct APK Build</h3>
                  </div>
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono font-bold">
                    Workflow Ready
                  </span>
                </div>
                <p className="text-neutral-300 text-[11px]">
                  Humne aapke project ke andar <code className="text-emerald-300 bg-black/40 px-1.5 py-0.5 rounded font-mono">.github/workflows/build-apk.yml</code> file configure kar di hai. GitHub ka server khud bakhud Ubuntu runner par Android SDK aur Gradle chala kar 100% Native Android APK generate karta hai!
                </p>
              </div>

              {/* Step-by-Step GitHub APK instructions */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                <h4 className="font-semibold text-white text-xs flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  GitHub Par Repo Aur APK Kaise Milegi (Step-by-Step):
                </h4>
                <ol className="space-y-3 text-neutral-300 list-decimal list-inside">
                  <li className="leading-relaxed">
                    <strong className="text-yellow-300">Pehla Step (Repo Export):</strong> Google AI Studio ke top-right bar mein <strong className="text-white">Settings / Export menu (⚙️ ya ⋯ icon)</strong> par click karein aur <strong className="text-emerald-300">"Export to GitHub"</strong> (ya "Push to GitHub") select karein. Is se ye pura project aapke GitHub profile par upload ho jayega!
                  </li>
                  <li className="leading-relaxed">
                    Apne GitHub par nayi bani hui repository khol kar top menu mein <strong className="text-white">"Actions"</strong> tab par click karein.
                  </li>
                  <li className="leading-relaxed">
                    Left sidebar mein <strong className="text-emerald-300">"Build Native Android APK"</strong> workflow par click karein.
                  </li>
                  <li className="leading-relaxed">
                    Right side par <span className="px-2 py-0.5 bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 rounded font-semibold font-mono">"Run workflow"</span> button dabayein.
                  </li>
                  <li className="leading-relaxed">
                    GitHub ka Ubuntu cloud server 2 se 3 minute mein Android APK compile kar ke de dega.
                  </li>
                  <li className="leading-relaxed">
                    Page ke bottom par <strong className="text-pink-300 font-mono">Artifacts &gt; WatchParty-MPV-Player-Debug.apk</strong> par click karke direct APK apne phone ya PC par download kar lein!
                  </li>
                </ol>
              </div>

              {/* What is Included in this Native APK */}
              <div className="p-3.5 bg-purple-950/40 border border-purple-500/30 rounded-xl space-y-2 text-[11px]">
                <strong className="text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-purple-400" />
                  Is APK Mein 100% Kya Kya Configured Hai:
                </strong>
                <ul className="space-y-1 text-neutral-300 list-disc list-inside">
                  <li><span className="text-emerald-300 font-semibold">WAKE_LOCK &amp; FOREGROUND_SERVICE</span>: Screen lock par bhi video/audio band nahi hogi.</li>
                  <li><span className="text-emerald-300 font-semibold">100% MPV Web Engine</span>: GPU hardware acceleration, anime shaders, brightness aur audio boost 300%.</li>
                  <li><span className="text-emerald-300 font-semibold">Background YouTube Audio Loop</span>: YouTube videos lock-screen notification panel se control hongi.</li>
                </ul>
              </div>
            </div>
          )}
          
          {/* TAB 1: DIRECT AUTO WEBAPK */}
          {activeTab === 'direct' && (
            <div className="space-y-4">
              {/* Highlight Box */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-violet-600/20 via-purple-600/20 to-pink-600/20 border border-violet-500/40">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-pink-400" />
                      <h3 className="text-sm font-bold text-white">Google Native WebAPK (Sab Se Asaan)</h3>
                    </div>
                    <p className="text-neutral-300 text-[11px] mt-1">
                      Google Chrome aur Android OS automatically is app ki official signed <strong className="text-emerald-300">.apk</strong> bana kar aapke phone launcher mein install kar deta hai!
                    </p>
                  </div>
                  {isInstallable && (
                    <button
                      onClick={handleInstallClick}
                      className="shrink-0 flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold rounded-lg shadow-lg shadow-emerald-600/30 transition-all text-xs active:scale-95"
                    >
                      <Download className="w-4 h-4" />
                      Install APK Now
                    </button>
                  )}
                </div>
              </div>

              {/* 3-Step Phone Install Guide */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                <h4 className="font-semibold text-white text-xs flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-emerald-400" />
                  Apne Android Phone Mein 10 Second Mein Install Karein:
                </h4>
                <ol className="space-y-3 text-neutral-300 list-decimal list-inside">
                  <li>
                    <span>Yeh URL apne phone ke <strong>Google Chrome</strong> mein open karein:</span>
                    <div className="mt-1.5 flex items-center gap-2 bg-[#090814] p-2 rounded-lg border border-white/10">
                      <span className="truncate font-mono text-[11px] text-violet-300 flex-1">{cleanUrl}</span>
                      <button
                        type="button"
                        onClick={() => handleCopyLink(cleanUrl, 'app-url')}
                        className="flex items-center gap-1 px-2.5 py-1 bg-white/10 hover:bg-white/20 rounded text-[11px] text-white transition-colors"
                      >
                        {copiedUrlLabel === 'app-url' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedUrlLabel === 'app-url' ? 'Copied!' : 'Copy Link'}</span>
                      </button>
                      <a
                        href={cleanUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-2.5 py-1 bg-violet-600 hover:bg-violet-500 rounded text-[11px] text-white font-semibold transition-colors"
                      >
                        <span>Open</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </li>
                  <li>
                    Chrome ke top-right corner par <span className="font-bold text-white">3 dots (⋮)</span> par tap karein.
                  </li>
                  <li>
                    Menu mein <span className="px-2 py-0.5 bg-violet-500/20 text-violet-300 rounded font-semibold border border-violet-500/30">"Install app"</span> ya <span className="px-2 py-0.5 bg-violet-500/20 text-violet-300 rounded font-semibold border border-violet-500/30">"Add to Home screen"</span> par tap karein.
                  </li>
                </ol>
              </div>

              {/* Native Advantage */}
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-start gap-2.5 text-emerald-200/90 text-[11px]">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong>Native WebAPK Ka Fayda:</strong> Android OS iska real package (<code className="text-emerald-300 font-mono">org.chromium.webapk</code>) bana kar apps list mein save karta hai. Browser ka address bar gayab ho jata hai, full-screen playback, custom app icon, aur notification controls sab natively chalti hain!
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: STANDALONE .APK FILE GENERATOR (PWABUILDER / TWA) */}
          {activeTab === 'apk' && (
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-violet-950/40 via-purple-950/30 to-indigo-950/40 border border-violet-500/30 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-white text-xs flex items-center gap-2">
                    <Package className="w-4 h-4 text-pink-400" />
                    PWABuilder Se Hamari App Ki Real .APK File Banayein
                  </h4>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/30 font-mono">
                    Official Microsoft & Google Tool
                  </span>
                </div>
                <p className="text-[11px] text-neutral-300">
                  Agar aap ko WhatsApp par doston ko bhejne ke liye ya phone mein bina browser ke direct install karne ke liye real <strong className="text-white">WatchParty.apk</strong> file chahiye, to <strong className="text-white">PWABuilder</strong> hamari app ko 1 click mein signed Android APK mein convert kar deta hai!
                </p>

                {/* 1-Click Action */}
                <div className="p-3.5 bg-black/50 border border-white/10 rounded-xl space-y-2.5">
                  <div className="text-xs font-semibold text-white flex items-center justify-between">
                    <span>Step 1: PWABuilder Generator Kholein</span>
                    <span className="text-[10px] text-emerald-400 font-mono">URL Auto-Configured</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={pwaBuilderUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white font-bold text-xs flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-pink-600/30"
                    >
                      <Download className="w-4 h-4" />
                      <span>Generate .APK on PWABuilder</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button
                      type="button"
                      onClick={() => handleCopyLink(cleanUrl, 'pwa-copy')}
                      className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-neutral-300 text-xs flex items-center gap-1.5 transition-colors"
                    >
                      {copiedUrlLabel === 'pwa-copy' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedUrlLabel === 'pwa-copy' ? 'App URL Copied!' : 'Copy App URL'}</span>
                    </button>
                  </div>
                  <div className="text-[10px] text-neutral-400">
                    Wahan ja kar bas <strong>"Package for Android"</strong> &gt; <strong>"Generate"</strong> dabayein, aapko ready-made <strong className="text-pink-300">WatchParty.apk</strong> file mil jaye gi!
                  </div>
                </div>
              </div>

              {/* Alternative Online APK Builders */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2.5">
                <h4 className="font-semibold text-white text-xs flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                  Doosre Free 1-Click Online APK Converters:
                </h4>
                <div className="space-y-2 text-[11px]">
                  <div className="p-2.5 bg-black/40 rounded-lg border border-white/5 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-white">AppsGeyser / Web2Apk</div>
                      <div className="text-[10px] text-neutral-400">App URL paste karein aur direct APK file download karein.</div>
                    </div>
                    <a
                      href="https://appsgeyser.com/create-url-app/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-neutral-200 text-xs flex items-center gap-1 font-medium transition-colors"
                    >
                      <span>Open Tool</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: CAPACITOR / ANDROID STUDIO BUILD */}
          {activeTab === 'capacitor' && (
            <div className="space-y-4">
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                <h4 className="font-semibold text-white text-xs flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  Source Code Se Full Native APK Build Karna (Capacitor)
                </h4>
                <p className="text-[11px] text-neutral-300">
                  Hamari is application ka complete React + Vite source code aapke pass hai. Aap is se direct Android Studio project bana kar native APK compile kar sakte hain:
                </p>

                <div className="space-y-2 font-mono text-[10px] bg-[#090814] p-3 rounded-xl border border-white/10 text-emerald-300 overflow-x-auto">
                  <div className="text-neutral-400"># 1. Top settings menu se 'Export to ZIP' download karein</div>
                  <div>npm install @capacitor/core @capacitor/cli @capacitor/android</div>
                  <div className="text-neutral-400"># 2. Capacitor initialize karein:</div>
                  <div>npx cap init "Watch Party" "com.watchparty.app" --web-dir dist</div>
                  <div className="text-neutral-400"># 3. Android native project generate karein:</div>
                  <div>npm run build</div>
                  <div>npx cap add android</div>
                  <div>npx cap open android</div>
                  <div className="text-pink-300"># 4. Android Studio mein &apos;Build &gt; Build Bundle(s) / APK(s) &gt; Build APK&apos; dabayein!</div>
                </div>
              </div>

              <div className="p-3 bg-violet-950/40 border border-violet-500/30 rounded-xl text-[11px] text-violet-200 space-y-1">
                <strong className="text-white block">Capacitor Native APK Ka Fayda:</strong>
                <div>Is tareeqe se pure Java/Kotlin Android project banta hai jismein background service permissions, wake locks, aur notification player controls 100% permanently enable ho jate hain!</div>
              </div>
            </div>
          )}

          {/* TAB 5: BACKGROUND YOUTUBE & MPV AUDIO */}
          {activeTab === 'bg' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-gradient-to-r from-emerald-950/40 via-teal-950/40 to-purple-950/40 border border-emerald-500/30 rounded-xl space-y-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <h4 className="font-bold text-white text-xs">Built-In Background YouTube Audio Engine Active!</h4>
                </div>
                <p className="text-[11px] text-neutral-300">
                  Hamare player mein <strong className="text-emerald-300">Silent Audio Anchor + MediaSession API + Screen WakeLock</strong> integrate kar dia gaya hai. Jab aap player mein <span className="text-emerald-400 font-mono font-bold">"BG 🎧"</span> button on rakhenge, to phone lock hone ya app minimize hone par bhi audio continue rehta hai!
                </p>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                <h4 className="font-semibold text-white text-xs flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-violet-400" />
                  YouTube Background Playback Kaise Kaam Karta Hai:
                </h4>
                <div className="space-y-2.5">
                  <div className="p-3 bg-white/5 rounded-lg border border-white/5">
                    <strong className="text-emerald-300 block mb-1">1. Top Bar "BG 🎧" Toggle (Active by default)</strong>
                    Player ke top bar par green color ka "BG 🎧" button hai. Is par tap karke aap background mode ko kisi bhi waqt toggle kar sakte hain. OSD par <code className="text-emerald-400">[mpv] Background Audio: ON 🎧</code> notification show hoti hai.
                  </div>

                  <div className="p-3 bg-white/5 rounded-lg border border-white/5">
                    <strong className="text-pink-300 block mb-1">2. Lock Screen / Notification Media Controls</strong>
                    Android phone lock karne par screen par Play/Pause/Seek buttons aate hain, jahan se aap background YouTube audio ko control kar sakte hain.
                  </div>

                  <div className="p-3 bg-white/5 rounded-lg border border-white/5">
                    <strong className="text-violet-300 block mb-1">3. Picture-in-Picture (PiP Mode)</strong>
                    Player ke bottom bar par PiP icon dabayein. Video screen par floating mini player ban jati hai aur background mein chalte rehti hai.
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-[#0e0d1f] border-t border-white/10 flex items-center justify-between">
          <div className="text-[11px] text-neutral-400 flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-violet-400" />
            <span>Watch Party &amp; MPV Player - Native Android APK</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium text-xs transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
