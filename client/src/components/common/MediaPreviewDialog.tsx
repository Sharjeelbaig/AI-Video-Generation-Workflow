import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';

export interface MediaPreviewTarget {
  title: string;
  kind: 'audio' | 'video';
  src: string;
}

interface Props {
  media: MediaPreviewTarget | null;
  onClose: () => void;
}

export default function MediaPreviewDialog({ media, onClose }: Props) {
  return (
    <Dialog
      open={!!media}
      onClose={onClose}
      fullWidth
      maxWidth={media?.kind === 'video' ? 'md' : 'sm'}
    >
      <DialogTitle sx={{ fontWeight: 700, pr: 7 }}>
        {media?.title || 'Preview'}
        <IconButton
          aria-label="Close preview"
          onClick={onClose}
          sx={{ position: 'absolute', top: 10, right: 10 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ pt: 1, pb: 3 }}>
        {!media ? null : media.kind === 'video' ? (
          <Box
            component="video"
            key={media.src}
            src={media.src}
            controls
            autoPlay
            playsInline
            sx={{
              width: '100%',
              maxHeight: '70vh',
              borderRadius: 2,
              bgcolor: 'black',
            }}
          />
        ) : (
          <Box sx={{ py: 1 }}>
            <Typography variant="body2" color="text.secondary" mb={2}>
              Audio preview
            </Typography>
            <Box
              component="audio"
              key={media.src}
              src={media.src}
              controls
              autoPlay
              sx={{ width: '100%' }}
            />
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
