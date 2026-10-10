# Nkata Blender add-on

Blender 4.2+ extension. N-panel, save hook, collection export, checks, pins, presence.

The desktop app installs it: the add-on is zipped and handed to `blender --command extension install-file -r user_default -e`. `make addon BLENDER_EXTENSIONS=...` symlinks it for development.

With no part open the N-panel offers Start a part: press Find my parts, pick one, and the file is named after the part's collection and saved where the part maps to, inside the folder the running agent serves (`~/.nkata/agent.json`). The save takes the lock and runs the checks like any save.
