
// {
//   "_id": "e1c16e5d-4eaa-46c3-9472-609ad7e67f50",
//   "start": "00:00:00.000",
//   "end": "00:00:02.568",
//   "mark": false,
//   "preset": "",
//   "speech": "/editor/api/tmp/mp4-1734597298423/speech/e1c16e5d-4eaa-46c3-9472-609ad7e67f50-1734604296.mp3",
//   "audioDuration": 2.568,
//   "srtDuration": 0,
//   "text": "我将老妈吊起来打了三天三夜",
//   "text2": "Tôi đã treo mẹ lên và đánh bà trong ba ngày ba đêm",
//   "speed": 1,
//   "voice": {
//       "name": "Voice 1",
//       "provider": "capcut",
//       "voice": "1",
//       "tone": "1",
//       "speed": 1
//   },
//   "srtStartTime": 0,
//   "srtEndTime": 1.6600000000000001
// },
// =>
// {
//   "name": "3caf6d16-a864-4438-9808-5f572755b8eb",
//   "url": "https://visub.oneflow.vn/editor/api/tmp/download-mp4-1734394889590/speech/3caf6d16-a864-4438-9808-5f572755b8eb-1734590828.mp3",
//   "extension": "mp3",
//   "options": {
//     "start": 0.0,
//     "end": 3.672,
//     "duration": 3.672
//   }
// },
function mapSubtitles(subtitle: any) {
  return {
    name: subtitle._id,
    url: `https://visub.oneflow.vn${subtitle.speech}`,
    extension: 'mp3',
    options: {
      start: dt2ms(subtitle.start),
      end: dt2ms(subtitle.end),
      duration: subtitle.audioDuration,
    },
  };
}

// 00:00:00.000 => 0
// 00:00:02.568 => 2.568
function dt2ms(dt: string) {
  const [hours, minutes, seconds] = dt.split(':').map(parseFloat);

  return hours * 3600 + minutes * 60 + seconds;
}

export function createTemplateDescriptor(payload: any) {
  const videoUrl = `${payload.videoUrl}original`;
  const audioUrl = `${payload.videoUrl}audio_192k.mp4`;
  const duration = payload.duration;

  const audios = payload.props.subtitle.map(mapSubtitles);

  const overlay = payload.props.overlay;

  const overlays = [];
  if (overlay && overlay.enabled) {
    overlays.push({
      name: 'overlay',
      type: 'blur',
      visibility: ['video_segment'],
      options: {
        x: overlay.x,
        y: overlay.y,
        width: overlay.width,
        height: overlay.height,
        color: overlay.color,
        blurStrength: 20,
      },
      filters: [],
    });
  }

  return  {
      "global": {
        "variables": {
          "videoSample": videoUrl
        },
        "subtitles": {
          "name": "1734701524027.ass",
          "fonts": [
            "Roboto"
          ]
        },
        "audio": null,
        "orientation": "landscape",
        "musicEnabled": false,
        "subtitlesEnabled": true,
        "audioEnabled": true,
        "blurEnabled": !!overlays.length,
        "transitionDuration": 0
      },
      overlays: overlays,
      "sections": [
        {
          "name": "test_video_1",
          "type": "video",
          "visibility": [
            "video_segment"
          ],
          "options": {
            "videoUrl": "{{ videoSample }}",
            "extension": "mp4",
            "duration": duration,
            "useAudio": true,
          },
          "filters": []
        }
      ],
      "audios": audios
    }
};

export function createProjectConfig() {
  const projectConfig = {
    assetsDir: './src/shared/assets',
    outputDir: './out',
    fields: {
      form_1_firstname: 'Emily',
      form_1_lastname: 'Parker',
      form_1_job: 'Frontend Developer',
      form_2_keyword1: 'php',
      form_2_keyword2: 'javascript',
      form_2_keyword3: 'typescript',
      form_2_keyword4: 'caffeine',
    },
  };

  return projectConfig;
}
