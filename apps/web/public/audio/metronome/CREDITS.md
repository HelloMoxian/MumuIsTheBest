# 节拍器采样音色

本目录采样来自 Frank Wen 的 Fluid (R3) SoundFont，经 WebAudioFont 数据项目转换为 MP3 采样及音区、原始音高与循环点元数据。本项目选取 38 种教学音色，保留 MIDI 24—100 涉及的音区及所需打击乐采样，将 JavaScript 数据转换成不可执行的 JSON。未加入个人作品或录音。

- 作者：Frank Wen；SoundFont 贡献者见下文。
- 数据转换项目：Sergey Surikov / [WebAudioFont data](https://github.com/surikov/webaudiofontdata)。
- 固定来源提交：23ca907d4370a04fd89ca483a92915e4d6159ab9。
- [上游所链接的 FluidR3 许可及原始声明](https://github.com/musescore/MuseScore/blob/deprecated_master/share/sound/FluidR3Mono_License.md)。
- 每个 JSON 内包含来源 URL、源文件 SHA-256 与提交号；通过 scripts/prepare-metronome-audio.py --asset <名称> 重建。
- 运行时全部从本机加载，不执行来源脚本、不联网拉取音色。不同音色是采样近似，不是对应真实乐器全部奏法的模拟。

## Fluid R3 原始署名

Fluid (R3) SoundFont
Copyright (c) 2000-2002, 2008 Frank Wen

Contributors: Suren M. Seron, Scott Hanan, Steve Aupperle, Chris Gillman, Alex Taubr, Chris Prola, Andrew Klenk, Winfried Hubbe, Dylan, Tim Gort, Uros Katic, Ethan Winer. Thanks to Toby Smithe for helping to get Fluid included in Ubuntu.

## MIT License

Copyright (c) 2000-2002, 2008 Frank Wen
Copyright (c) 2017 Srgy Surkv (WebAudioFont data conversion)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
