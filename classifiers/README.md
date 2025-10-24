# Content Classifiers

This directory is reserved for future content classification modules.

## Future Classifier Types

### 1. Transcript Analyzer
Analyze video transcripts/captions for concerning language:
- Profanity detection
- Violence indicators
- Inappropriate themes
- Racist or hateful speech

### 2. ML-based Classification
Use machine learning models to classify content:
- Violence detection from thumbnails
- Audio analysis for screaming/distressing sounds
- Topic modeling for content categories

### 3. Comment Analyzer
Analyze video comments for:
- Community sentiment
- Warning signs from other viewers
- Age-inappropriate discussions

### 4. Thumbnail Analyzer
Analyze video thumbnails using computer vision:
- Gore or blood detection
- Weapon detection
- Adult content detection

## Classifier Interface

Each classifier should export a function with this signature:

```javascript
/**
 * @param {Object} video - Video details object
 * @param {Object} options - Classifier-specific options
 * @returns {Promise<Object>} Classification result
 */
export async function classify(video, options = {}) {
  return {
    videoId: video.id,
    classifierName: 'example-classifier',
    result: {
      // Classifier-specific results
    },
    flags: [
      {
        type: 'CLASSIFIER_FLAG_TYPE',
        severity: 'HIGH|MEDIUM|LOW',
        message: 'Human-readable message',
        confidence: 0.95
      }
    ]
  };
}
```

## Integration

To integrate a new classifier:

1. Create your classifier file in this directory
2. Import it in `content-classifier.js`
3. Add it to the classification pipeline
4. Update configuration to enable/disable classifiers

## Example: Transcript Classifier

```javascript
// classifiers/transcript-classifier.js
import {getYouTubeClient} from '../video-analyzer.js';

const PROFANITY_LIST = ['word1', 'word2', 'word3'];

export async function classify(video, options = {}) {
  if (!video.hasCaption) {
    return {
      videoId: video.id,
      classifierName: 'transcript',
      skipped: true,
      reason: 'No captions available'
    };
  }

  // Fetch transcript
  const youtube = await getYouTubeClient();
  const captions = await youtube.captions.list({
    videoId: video.id,
    part: ['snippet']
  });

  // Analyze transcript for profanity
  const flags = [];
  // ... analysis logic ...

  return {
    videoId: video.id,
    classifierName: 'transcript',
    flags
  };
}
```

## Notes

- Classifiers should be **optional** and **configurable**
- Use **caching** to avoid re-analyzing the same content
- Handle **API rate limits** gracefully
- Provide **confidence scores** when using ML models
- Support **batch processing** for efficiency
