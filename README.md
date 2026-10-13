# RoboAssembly dashboard

Static encrypted dashboard hosted on GitHub Pages. No account sign-in is needed.
Obtain the access password from the project owner.

This repository contains a browser unlock screen and an encrypted bundle. The
bundle includes the dashboard, its experiment evidence, figures, and video.
The browser derives an AES-GCM key from the supplied password using PBKDF2 and
decrypts the bundle in memory. Passwords and decrypted content are not saved in
localStorage or cookies. Refreshing the page locks it again.

The public repository and ciphertext can be downloaded by anyone. Client-side
password protection does not provide server-side authorization, revocation, or
protection against password guessing. Anyone with the password can save and
share the decrypted content. Do not use this repository for confidential data.

Only the deployable encrypted output belongs here. Unencrypted source, build
credentials, source archives, and the password must stay outside this repository.

Publishing uses the `main` branch root with `.nojekyll` and GitHub Pages HTTPS.
