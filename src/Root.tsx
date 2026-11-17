import React from "react";
import { Composition } from "remotion";
import manifestJson from "./generated/timeline-manifest.json";
import { MainVideo } from "./MainVideo";
import type { TimelineManifest } from "./types/video";

const manifest = manifestJson as unknown as TimelineManifest;

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="BangladeshVsRussia"
      component={MainVideo}
      durationInFrames={manifest.totalFrames}
      fps={manifest.fps}
      width={manifest.width}
      height={manifest.height}
      defaultProps={{
        manifest,
        includeAudio: true,
      }}
      calculateMetadata={async ({ props }) => ({
        durationInFrames: props.manifest.totalFrames,
        fps: props.manifest.fps,
        width: props.manifest.width,
        height: props.manifest.height,
      })}
    />
  );
};

export default RemotionRoot;
