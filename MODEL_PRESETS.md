# Model Presets

Model Studio now supports a dedicated look-preset folder structure.

Preferred structure:

```text
public/models/
  bianca/
    presets/
      bianca-look-01/
        front.jpg
        side.jpg
        back.jpg
      bianca-look-02/
        front.jpg
        full.jpg
    originals/
      ...
  sydney/
    presets/
      sydney-look-01/
        front.jpg
        side.jpg
        back.jpg
      sydney-look-02/
        front.jpg
        full.jpg
```

Notes:

- `public/models/<model>/presets/<look-id>/` is now the preferred place for curated looks.
- `front.jpg` is the default image shown in the UI for that look.
- `side.jpg`, `back.jpg`, and `full.jpg` are optional linked variants used only when the user switches the View control.
- Legacy root-level images under `public/models/<model>/` still work, so existing Bianca/Sydney images do not break.
- The look folder name becomes the UI label automatically.

Suggested look folder pattern:

```text
<model>-<look-name>-<index>/
```

Examples:

- `sydney-brown-fur-01/front.jpg`
- `sydney-brown-fur-01/side.jpg`
- `sydney-brown-fur-01/back.jpg`
- `bianca-neutral-pants-01/front.jpg`
