import { type ComponentRef, useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Keyboard,
  Platform,
  ScrollView,
  type ScrollViewProps,
  StyleSheet,
  TextInput,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

export function KeyboardAwareScrollView({
  children,
  contentContainerStyle,
  onScroll,
  extraScrollHeight = 32,
  ...rest
}: ScrollViewProps & {
  extraScrollHeight?: number;
}) {
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const scrollYRef = useRef(0);
  const keyboardHeightRef = useRef(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const scrollFocusedInputIntoView = useCallback(
    (kbHeight: number) => {
      if (kbHeight <= 0) return;
      const focusedInput = TextInput.State.currentlyFocusedInput?.();
      if (!focusedInput || typeof focusedInput.measureInWindow !== 'function') return;

      focusedInput.measureInWindow((_x, y, _width, height) => {
        if (typeof y !== 'number' || typeof height !== 'number') return;
        const windowHeight = Dimensions.get('window').height;
        const visibleBottom = windowHeight - kbHeight - extraScrollHeight;
        const inputBottom = y + height;

        if (inputBottom > visibleBottom) {
          const overlap = inputBottom - visibleBottom;
          scrollRef.current?.scrollTo({
            y: Math.max(0, scrollYRef.current + overlap),
            animated: true,
          });
        }
      });
    },
    [extraScrollHeight]
  );

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      const kbHeight = e.endCoordinates?.height ?? 0;
      keyboardHeightRef.current = kbHeight;
      setKeyboardHeight(kbHeight);
      setTimeout(() => {
        scrollFocusedInputIntoView(kbHeight);
      }, 60);
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      keyboardHeightRef.current = 0;
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [scrollFocusedInputIntoView]);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollYRef.current = e.nativeEvent.contentOffset.y;
      onScroll?.(e);
    },
    [onScroll]
  );

  const handleFocusCapture = useCallback(() => {
    if (keyboardHeightRef.current > 0) {
      setTimeout(() => {
        scrollFocusedInputIntoView(keyboardHeightRef.current);
      }, 80);
    }
  }, [scrollFocusedInputIntoView]);

  const flattenedContent = StyleSheet.flatten(contentContainerStyle) || {};
  const basePaddingBottom =
    typeof flattenedContent.paddingBottom === 'number' ? flattenedContent.paddingBottom : 32;

  return (
    <ScrollView
      ref={scrollRef}
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      scrollEventThrottle={16}
      onScroll={handleScroll}
      onTouchStart={ undefined }
      onFocusCapture={handleFocusCapture}
      contentContainerStyle={[
        contentContainerStyle,
        keyboardHeight > 0 && {
          paddingBottom: basePaddingBottom + keyboardHeight + extraScrollHeight,
        },
      ]}
      {...rest}
    >
      {children}
    </ScrollView>
  );
}
