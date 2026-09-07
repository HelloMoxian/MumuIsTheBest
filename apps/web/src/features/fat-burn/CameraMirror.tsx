import { useCallback, useEffect, useRef, useState } from "react";

export function CameraMirror() {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const [active, setActive] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("给自己一面运动镜子");
  const stop = useCallback(() => {
    generation.current++;
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    if (mounted.current) { setActive(false); setPending(false); }
  }, []);
  const start = async () => {
    stop();
    if (!navigator.mediaDevices?.getUserMedia) { setMessage("当前浏览器无法打开镜子，仍可跟着示范运动。"); return; }
    const token = generation.current;
    setPending(true); setMessage("请在浏览器中允许摄像头，也可以取消。");
    try {
      const next = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      if (!mounted.current || token !== generation.current) { next.getTracks().forEach(track => track.stop()); return; }
      stream.current = next;
      next.getVideoTracks().forEach(track => {
        track.enabled = !document.hidden;
        track.onended = () => { if (token === generation.current) { stop(); setMessage("摄像头已断开，可以重新打开。"); } };
      });
      if (video.current) { video.current.srcObject = next; await video.current.play(); }
      if (mounted.current && token === generation.current) { setActive(true); setPending(false); setMessage("镜子里的你"); }
    } catch {
      if (mounted.current && token === generation.current) { stop(); setMessage("镜子没有打开，跟练可以继续，也可以重试。"); }
    }
  };
  useEffect(() => {
    mounted.current = true;
    const visibility = () => stream.current?.getVideoTracks().forEach(track => { track.enabled = !document.hidden; });
    const leave = () => { stop(); setMessage("镜子已关闭"); };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", leave);
    return () => { mounted.current = false; stop(); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("pagehide", leave); };
  }, [stop]);
  return <section className={`fat-burn-mirror ${active ? "is-active" : ""}`} aria-label="本机运动镜子">
    <video ref={video} autoPlay muted playsInline hidden={!active} />
    {!active && <div className="fat-burn-mirror-empty"><span aria-hidden="true">◎</span><p role="status">{message}</p></div>}
    <div className="fat-burn-mirror-caption"><span>只在本机显示 · 不录制、不上传</span>
      <button className="fb-button fb-quiet" onClick={() => { if (active || pending) { stop(); setMessage("镜子已关闭"); } else void start(); }}>{active ? "关闭镜子" : pending ? "取消开启" : "打开镜子"}</button>
    </div>
  </section>;
}
