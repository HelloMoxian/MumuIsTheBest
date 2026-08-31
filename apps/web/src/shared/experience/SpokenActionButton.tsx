import type { ButtonHTMLAttributes, MouseEventHandler } from "react";
import {
  speakLearningMoment,
  type LearningSpeechMoment,
} from "./learning-speech";

export type SpokenActionButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
  speech: LearningSpeechMoment;
  onClick?: MouseEventHandler<HTMLButtonElement>;
};

export function announceSpokenAction(speech: LearningSpeechMoment) {
  return speakLearningMoment(speech);
}

export function SpokenActionButton({
  speech,
  onClick,
  type = "button",
  ...buttonProps
}: SpokenActionButtonProps) {
  const handleClick: MouseEventHandler<HTMLButtonElement> = (event) => {
    onClick?.(event);
    if (!event.defaultPrevented) void announceSpokenAction(speech);
  };

  return <button {...buttonProps} type={type} onClick={handleClick} />;
}
