export interface TraceContext {
  traceId: string;
  requestId?: string;
  actor?: string;
  channel?: string;
  userId?: string;
  telegramUserId?: string;
  chatId?: string;
}

export interface LogFields extends Record<string, unknown> {
  trace_id?: string;
  request_id?: string;
  actor?: string;
  channel?: string;
  user_id?: string;
  telegram_user_id?: string;
  chat_id?: string;
  operation?: string;
  duration_ms?: number;
  outcome?: string;
  service?: string;
  tool_name?: string;
  metric_name?: string;
}

function toErrorFields(error: unknown) {
  if (error instanceof Error) {
    return {
      error_name: error.name,
      error_message: error.message,
      error_stack: error.stack,
    };
  }

  return {
    error_message: String(error),
  };
}

function baseFields(context?: TraceContext): LogFields {
  return {
    trace_id: context?.traceId,
    request_id: context?.requestId,
    actor: context?.actor,
    channel: context?.channel,
    user_id: context?.userId,
    telegram_user_id: context?.telegramUserId,
    chat_id: context?.chatId,
  };
}

function writeLog(level: "info" | "warn" | "error", message: string, fields?: LogFields) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    ...fields,
  };

  const line = JSON.stringify(payload);

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
}

export function logInfo(message: string, fields?: LogFields, context?: TraceContext) {
  writeLog("info", message, { ...baseFields(context), ...fields });
}

export function logWarn(message: string, fields?: LogFields, context?: TraceContext) {
  writeLog("warn", message, { ...baseFields(context), ...fields });
}

export function logError(message: string, error: unknown, fields?: LogFields, context?: TraceContext) {
  writeLog("error", message, {
    ...baseFields(context),
    ...fields,
    ...toErrorFields(error),
  });
}

export function emitMetric(
  metricName: string,
  value: number,
  fields?: LogFields,
  context?: TraceContext
) {
  writeLog("info", "metric", {
    ...baseFields(context),
    ...fields,
    metric_name: metricName,
    metric_value: value,
  });
}

export function startTimer() {
  const startedAt = Date.now();

  return {
    elapsedMs: () => Date.now() - startedAt,
  };
}

export function createTraceContext(init?: Partial<TraceContext>): TraceContext {
  return {
    traceId: init?.traceId || crypto.randomUUID(),
    requestId: init?.requestId || crypto.randomUUID(),
    actor: init?.actor,
    channel: init?.channel,
    userId: init?.userId,
    telegramUserId: init?.telegramUserId,
    chatId: init?.chatId,
  };
}
