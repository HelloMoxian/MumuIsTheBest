import { useState } from "react";
import { getCourse, moveLabel, PRESET_COURSES, type WorkoutCourse } from "./plan";
import { MomCoach } from "./MomCoach";
import { PROGRAM_SCOPE, PROGRAM_SOURCES, WEEK_PLANS, weeklyAerobicRange } from "./program";

const categories = { cardio: "有氧", strength: "力量", recovery: "恢复" } as const;
const rangeText = (range: readonly [number, number]) => range[0] === range[1] ? `${range[0]}` : `${range[0]}–${range[1]}`;

export function CourseLibrary({ selectedId, onChange }: { selectedId: string; onChange: (id: string) => void }) {
  const selected = getCourse(selectedId);
  return <>
    <p>从短课和一组力量开始。适应后再加时长或组数，今天累了也可以选恢复课。</p>
    <div className="fat-burn-course-grid" role="group" aria-label="预制课程">
      {PRESET_COURSES.map(course => <button key={course.id} className="fat-burn-course-card" aria-pressed={selectedId === course.id} onClick={() => onChange(course.id)}>
        <span>{categories[course.category]} · {course.totalMs / 60_000} 分钟 {selectedId === course.id && "✓ 已选"}</span>
        <strong>{course.title}</strong><span>{course.description}</span>
      </button>)}
    </div>
    <section className="fat-burn-course-info" aria-label="所选课程详情">
      <h3>{selected.title}</h3><p>{selected.intensity}</p>
      <p><strong>准备：</strong>{selected.equipment.join("、") || "徒手，无需器械"}</p><p>{selected.guidance}</p>
    </section>
  </>;
}

export function WeeklyProgram({ onChoose }: { onChoose: (id: string) => void }) {
  const [level, setLevel] = useState<"starting" | "steady">("starting");
  const days = WEEK_PLANS[level];
  return <>
    <p>{PROGRAM_SCOPE}</p>
    <div className="fat-burn-week-tabs" role="group" aria-label="课表阶段">
      <button className="fb-button" aria-pressed={level === "starting"} onClick={() => setLevel("starting")}>起步阶段</button>
      <button className="fb-button" aria-pressed={level === "steady"} onClick={() => setLevel("steady")}>稳定之后</button>
    </div>
    <p>{level === "starting" ? "先用这张表建立习惯。需要时从 5–10 分钟活动开始，不要求第一周达到 150 分钟。" : "在多次练习都舒适、次日恢复良好后再用这张表。快走可以分散在一天里，无须一次做完。"}</p>
    <div className="fat-burn-week-list">
      {days.map(day => <article key={day.day}>
        <strong>{day.day}</strong><div>
          {day.courseId && <button className="fat-burn-course-link" onClick={() => onChoose(day.courseId!)}>{getCourse(day.courseId).title} · {getCourse(day.courseId).totalMs / 60_000} 分钟 →</button>}
          {day.walkMinutes[1] > 0 && <p>{day.courseId ? "另加" : "快走"} {rangeText(day.walkMinutes)} 分钟{day.courseId && "快走"}</p>}
          <p>{day.note}</p>
        </div>
      </article>)}
    </div>
    <div className="fat-burn-course-info">
      <h3>有氧计划量：约 {rangeText(weeklyAerobicRange(days))} 分钟 / 周</h3>
      <p>只有达到“能说话、难唱歌”的有氧主段和快走计入。热身、组间休息、力量和拉伸不自动计入；这是安排示例，不是对实际运动量的测量。</p>
      <h3>什么时候增加？</h3>
      <p>连续几次动作稳定、没有不适，且次日恢复良好，再只增加一项：每次有氧多 5 分钟，或力量多几次、多一组、略增阻力。无需赶进度；休息不足可以多停一会儿。</p>
      <p>力量组末稍感吃力，但保留约 2–3 次余力。水瓶太轻时先学动作，之后再适量加水或用轻哑铃；不要把空手划动当作同等力量训练。</p>
      <p>产后恢复、手术恢复或已有运动限制需要另行安排；出现疼痛、漏尿或盆底坠胀时停止相关动作，寻求医护或盆底物理治疗师指导。胸痛、明显头晕或异常气短时停止并及时就医。</p>
    </div>
    <p className="fat-burn-source-note">依据 CDC、ACSM 等指南编排，具体动作顺序与时间是本站的一般入门方案。查证于 2026-09-07。</p>
    <div className="fat-burn-source-links">{PROGRAM_SOURCES.map(source => <a key={source.href} href={source.href} target="_blank" rel="noreferrer">{source.title} ↗</a>)}</div>
  </>;
}

export function CoursePlan({ course }: { course: WorkoutCourse }) {
  const moves = course.segments.filter((part, index, all) => part.kind === "move" && all.findIndex(other => other.move === part.move && other.side === part.side && other.purpose === part.purpose) === index);
  const [previewId, setPreviewId] = useState(moves[0].id);
  const [previewPhase, setPreviewPhase] = useState(0);
  const preview = moves.find(part => part.id === previewId) ?? moves[0];
  return <>
    <p>{course.description} {course.guidance}</p>
    <p><strong>准备：</strong>{course.equipment.join("、") || "徒手，无需器械"}</p>
    <details className="fat-burn-preview">
      <summary>先看动作示范与要点</summary>
      <label htmlFor="fat-burn-preview-move">查看动作</label>
      <select id="fat-burn-preview-move" value={preview.id} onChange={event => { setPreviewId(event.target.value); setPreviewPhase(0); }}>
        {moves.map(part => <option key={part.id} value={part.id}>{course.phases.find(item => item.id === part.phase)!.label} · {moveLabel(part, false)}</option>)}
      </select>
      <div className="fat-burn-preview-figure"><MomCoach move={preview.move} phase={previewPhase} lowImpact profile side={preview.side} /></div>
      <div className="fat-burn-week-tabs" role="group" aria-label="预览姿势">
        <button className="fb-button" aria-pressed={previewPhase === 0} onClick={() => setPreviewPhase(0)}>起始</button>
        <button className="fb-button" aria-pressed={previewPhase === .5} onClick={() => setPreviewPhase(.5)}>动作中段</button>
        <button className="fb-button" aria-pressed={previewPhase === 1.5} onClick={() => setPreviewPhase(1.5)}>换边</button>
      </div>
      {preview.prescription && <p>{preview.prescription}</p>}<p>{preview.cue.replace(preview.prescription ?? "", "").trim()}</p>
    </details>
    {course.phases.map(phase => <section key={phase.id} className="fat-burn-plan-phase">
      <h3>{phase.label}<span>{phase.durationMs / 60_000} 分钟</span></h3>
      <ol>{course.segments.filter(part => part.phase === phase.id).map(part => <li key={part.id}>
        <div><span>{part.round ? `第 ${part.round} 组 · ` : ""}{moveLabel(part, false)}</span><p>{part.cue}</p>{part.prescription && !part.cue.includes(part.prescription) && <p>{part.prescription}</p>}</div>
        <small>{part.durationMs / 1000} 秒</small>
      </li>)}</ol>
    </section>)}
    <p>倒计时是可用的练习或休息时间。按目标做够就休息，不必做满，也不必跟音乐赶拍。画面不判断次数、动作质量或实际强度。</p>
  </>;
}
