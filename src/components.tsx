import {
  Detail,
  ActionPanel,
  Action,
  Icon,
  Clipboard,
  showToast,
  Toast,
} from "@raycast/api";

export function ErrorDetail({
  error,
  context,
}: {
  error: Error | string;
  context?: Record<string, unknown>;
}) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;
  const debugInfo = {
    error: errorMessage,
    stack: errorStack,
    timestamp: new Date().toISOString(),
    ...context,
  };
  const debugText = JSON.stringify(debugInfo, null, 2);

  return (
    <Detail
      markdown={`# Error\n\n${errorMessage}\n\n## Debug Info\n\n\`\`\`json\n${debugText}\n\`\`\`\n\nPress **Enter** to copy debug info.`}
      actions={
        <ActionPanel>
          <Action
            title="Copy Debug Info"
            icon={Icon.Clipboard}
            onAction={async () => {
              await Clipboard.copy(debugText);
              showToast({
                style: Toast.Style.Success,
                title: "Debug info copied",
              });
            }}
          />
        </ActionPanel>
      }
    />
  );
}
