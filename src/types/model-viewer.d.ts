import 'react';

// model-viewer Web Component（@google/model-viewer）的 JSX 类型声明
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        alt?: string;
        poster?: string;
        'camera-controls'?: boolean;
        'auto-rotate'?: boolean;
        'rotation-per-second'?: string;
        'shadow-intensity'?: string;
        'shadow-softness'?: string;
        exposure?: string;
        'disable-zoom'?: boolean;
        style?: React.CSSProperties;
      };
    }
  }
}

export {};
