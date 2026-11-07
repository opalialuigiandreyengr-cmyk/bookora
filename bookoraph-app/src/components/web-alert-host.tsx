import { useEffect, useState } from 'react';
import {
  Alert,
  type AlertButton,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { Text } from '@/components/app-text';
import { colors, radius, space } from '@/theme';

type AlertRequest = {
  title: string;
  message?: string;
  buttons: AlertButton[];
  isPrompt?: boolean;
  defaultValue?: string;
};

let enqueueAlert: ((req: AlertRequest) => void) | null = null;

if (Platform.OS === 'web') {
  Alert.alert = (title: string, message?: string, buttons?: AlertButton[]) => {
    const resolvedButtons: AlertButton[] =
      buttons && buttons.length > 0 ? buttons : [{ text: 'OK', style: 'default' }];
    if (enqueueAlert) {
      enqueueAlert({ title, message, buttons: resolvedButtons });
    } else if (typeof window !== 'undefined') {
      const fullText = message ? `${title}\n\n${message}` : title;
      if (resolvedButtons.length > 1) {
        const confirmed = window.confirm(fullText);
        const actionBtn =
          resolvedButtons.find((b) => b.style !== 'cancel') || resolvedButtons[resolvedButtons.length - 1];
        const cancelBtn = resolvedButtons.find((b) => b.style === 'cancel');
        if (confirmed) actionBtn?.onPress?.();
        else cancelBtn?.onPress?.();
      } else {
        window.alert(fullText);
        resolvedButtons[0]?.onPress?.();
      }
    }
  };

  Alert.prompt = (
    title?: string | null,
    message?: string | null,
    callbackOrButtons?: ((text: string) => void) | AlertButton[] | null,
    _type?: string | null,
    defaultValue?: string,
  ) => {
    const resolvedButtons: AlertButton[] =
      typeof callbackOrButtons === 'function'
        ? [
            { text: 'Cancel', style: 'cancel' },
            { text: 'OK', onPress: callbackOrButtons },
          ]
        : callbackOrButtons && callbackOrButtons.length > 0
          ? callbackOrButtons
          : [{ text: 'OK' }];

    if (enqueueAlert) {
      enqueueAlert({
        title: title || '',
        message: message || undefined,
        buttons: resolvedButtons,
        isPrompt: true,
        defaultValue: defaultValue || '',
      });
    }
  };

  const originalShare = Share.share.bind(Share);
  Share.share = async (content, options) => {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        return await originalShare(content, options);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return { action: Share.dismissedAction, activityType: undefined };
      }
    }
    const textToCopy = content.url || content.message || '';
    if (textToCopy && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(textToCopy);
      Alert.alert('Copied', 'Copied to clipboard.');
    }
    return { action: Share.sharedAction, activityType: undefined };
  };
}

export function WebAlertHost() {
  const [queue, setQueue] = useState<AlertRequest[]>([]);
  const [promptValue, setPromptValue] = useState('');

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    enqueueAlert = (req) => {
      setPromptValue(req.defaultValue || '');
      setQueue((prev) => [...prev, req]);
    };
    return () => {
      enqueueAlert = null;
    };
  }, []);

  if (Platform.OS !== 'web' || queue.length === 0) return null;

  const current = queue[0];
  const closeCurrent = (btn?: AlertButton) => {
    const val = promptValue;
    setQueue((prev) => prev.slice(1));
    setTimeout(() => {
      if (current.isPrompt) {
        (btn?.onPress as ((value?: string) => void) | undefined)?.(val);
      } else {
        btn?.onPress?.();
      }
    }, 10);
  };

  const cancelBtn = current.buttons.find((b) => b.style === 'cancel');

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => closeCurrent(cancelBtn)}
    >
      <Pressable
        style={styles.backdrop}
        onPress={() => {
          if (cancelBtn || current.buttons.length === 1) {
            closeCurrent(cancelBtn || current.buttons[0]);
          }
        }}
      >
        <Pressable style={styles.dialog} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{current.title}</Text>
          {current.message ? <Text style={styles.message}>{current.message}</Text> : null}

          {current.isPrompt ? (
            <TextInput
              value={promptValue}
              onChangeText={setPromptValue}
              placeholder="Optional note…"
              placeholderTextColor="#96918B"
              style={styles.promptInput}
              autoFocus
            />
          ) : null}

          <View
            style={[
              styles.actions,
              current.buttons.length > 2 && styles.actionsStacked,
            ]}
          >
            {current.buttons.map((btn, idx) => {
              const isCancel = btn.style === 'cancel';
              const isDestructive = btn.style === 'destructive';
              return (
                <Pressable
                  key={`${btn.text || 'OK'}-${idx}`}
                  accessibilityRole="button"
                  onPress={() => closeCurrent(btn)}
                  style={({ pressed }) => [
                    styles.button,
                    current.buttons.length <= 2 && styles.buttonFlex,
                    isCancel && styles.buttonCancel,
                    isDestructive && styles.buttonDestructive,
                    !isCancel && !isDestructive && styles.buttonPrimary,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      isCancel && styles.buttonTextCancel,
                      isDestructive && styles.buttonTextDestructive,
                      !isCancel && !isDestructive && styles.buttonTextPrimary,
                    ]}
                  >
                    {btn.text || 'OK'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(23, 33, 43, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
  },
  dialog: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.line,
    shadowColor: '#17212B',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  title: {
    color: colors.ink,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  message: {
    color: colors.muted,
    fontSize: 13.5,
    lineHeight: 19,
    textAlign: 'center',
  },
  promptInput: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#FAF8F5',
    paddingHorizontal: 12,
    color: colors.ink,
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 14,
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  actionsStacked: {
    flexDirection: 'column',
  },
  button: {
    minHeight: 44,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  buttonFlex: {
    flex: 1,
  },
  buttonPrimary: {
    backgroundColor: colors.coral,
  },
  buttonCancel: {
    backgroundColor: '#F3F4F6',
  },
  buttonDestructive: {
    backgroundColor: colors.danger,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  buttonTextPrimary: {
    color: '#FFFFFF',
  },
  buttonTextCancel: {
    color: colors.ink,
  },
  buttonTextDestructive: {
    color: '#FFFFFF',
  },
});
