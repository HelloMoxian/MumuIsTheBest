#!/usr/bin/env bash

# One-command local launcher for Mumu 学习岛.
# Default behavior: install dependencies, free this app's ports, start services, and open the browser.
set -Eeuo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
WEB_PORT=5173
SERVER_PORT=8787
WEB_URL="http://localhost:${WEB_PORT}/"
HEALTH_URL="http://127.0.0.1:${SERVER_PORT}/api/health"

say() {
  printf '\n🚀 %s\n' "$1"
}

fail() {
  printf '\n❌ %s\n' "$1" >&2
  exit 1
}

require_node() {
  command -v node >/dev/null 2>&1 || fail "未找到 Node.js。请安装 Node.js 24 或更高版本后再运行此脚本。"
  local node_major
  node_major="$(node -p "process.versions.node.split('.')[0]")"
  [[ "${node_major}" =~ ^[0-9]+$ ]] || fail "无法读取 Node.js 版本。"
  (( node_major >= 24 )) || fail "当前 Node.js 为 $(node --version)，项目需要 Node.js 24 或更高版本。"
}

configure_pnpm() {
  if command -v pnpm >/dev/null 2>&1; then
    PNPM=(pnpm)
    return
  fi

  if command -v corepack >/dev/null 2>&1; then
    PNPM=(corepack pnpm)
    return
  fi

  fail "未找到 pnpm 或 Corepack。请安装 Node.js 24+（含 Corepack）或 pnpm 后重试。"
}

configure_data_directory() {
  local project_parent
  project_parent="$(cd -- "${PROJECT_ROOT}/.." && pwd)"
  APP_DATA_DIR="${APP_DATA_DIR:-${project_parent}/data}"
  [[ "${APP_DATA_DIR}" = /* ]] || fail "APP_DATA_DIR 必须是仓库外的绝对路径。"
  APP_DATA_DIR="$(node -e 'process.stdout.write(require("node:path").resolve(process.argv[1]))' "${APP_DATA_DIR}")"
  case "${APP_DATA_DIR}" in
    "${PROJECT_ROOT}"|"${PROJECT_ROOT}/"*)
      fail "APP_DATA_DIR 必须位于 Git 仓库之外。"
      ;;
  esac

  RUNTIME_DIR="${APP_DATA_DIR}/run"
  LOG_DIR="${APP_DATA_DIR}/logs"
  LOG_FILE="${LOG_DIR}/mumu-dev.log"
  PID_FILE="${RUNTIME_DIR}/mumu-dev.pid"
  mkdir -p "${APP_DATA_DIR}" "${RUNTIME_DIR}" "${LOG_DIR}" \
    || fail "无法创建本机数据目录：${APP_DATA_DIR}"
  chmod 700 "${APP_DATA_DIR}" "${RUNTIME_DIR}" "${LOG_DIR}" \
    || fail "无法保护本机数据目录权限：${APP_DATA_DIR}"
  export APP_DATA_DIR
}

port_pids() {
  lsof -tiTCP:"$1" -sTCP:LISTEN 2>/dev/null || true
}

stop_port() {
  local port="$1"
  local pids
  pids="$(port_pids "${port}")"

  [[ -n "${pids}" ]] || return 0
  printf '释放端口 %s（仅终止正在监听该端口的进程）…\n' "${port}"

  while IFS= read -r pid; do
    [[ "${pid}" =~ ^[0-9]+$ ]] && kill "${pid}" 2>/dev/null || true
  done <<< "${pids}"

  for _ in {1..20}; do
    [[ -z "$(port_pids "${port}")" ]] && return 0
    sleep 0.25
  done

  pids="$(port_pids "${port}")"
  while IFS= read -r pid; do
    [[ "${pid}" =~ ^[0-9]+$ ]] && kill -9 "${pid}" 2>/dev/null || true
  done <<< "${pids}"

  sleep 0.25
  [[ -z "$(port_pids "${port}")" ]] || fail "无法释放端口 ${port}。请检查系统权限或手动关闭该进程。"
}

wait_for_services() {
  command -v curl >/dev/null 2>&1 || fail "未找到 curl，无法确认服务是否成功启动。"

  for _ in {1..60}; do
    if curl --fail --silent --show-error --max-time 1 "${WEB_URL}" >/dev/null 2>&1 \
      && curl --fail --silent --show-error --max-time 1 "${HEALTH_URL}" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done

  tail -n 80 "${LOG_FILE}" >&2 || true
  fail "网页或语音服务在 30 秒内未成功启动。上方是最近的启动日志。"
}

open_browser() {
  [[ "${MUMU_NO_OPEN:-0}" == "1" ]] && return 0

  if command -v open >/dev/null 2>&1; then
    open "${WEB_URL}"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "${WEB_URL}" >/dev/null 2>&1 &
  else
    printf '网页已启动，请在浏览器打开：%s\n' "${WEB_URL}"
  fi
}

require_node
configure_pnpm
configure_data_directory
cd "${PROJECT_ROOT}"

say "初始化依赖环境"
"${PNPM[@]}" install --frozen-lockfile --prefer-offline

# pnpm 10+ protects installs by requiring native/postinstall builds to be explicitly approved.
# The lockfile fixes the exact dependency set; this makes a fresh clone launchable in one step.
"${PNPM[@]}" approve-builds --all

say "清理旧的本项目服务"
stop_port "${WEB_PORT}"
stop_port "${SERVER_PORT}"

say "启动 Mumu 学习岛"
nohup "${PNPM[@]}" dev >"${LOG_FILE}" 2>&1 < /dev/null &
echo "$!" > "${PID_FILE}"

wait_for_services
open_browser

printf '\n✅ Mumu 学习岛已启动：%s\n' "${WEB_URL}"
printf '   启动日志：%s\n' "${LOG_FILE}"
printf '   下次重新运行此脚本会自动替换旧服务。\n'
