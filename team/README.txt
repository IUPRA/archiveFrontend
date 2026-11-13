Team portraits for the About page.

The About page no longer reads images from this folder. Profiles — name, title,
bio and portrait — come from GET /student-profiles on the API Gateway in
config.js, so adding a profile in AWS is all it takes to have it appear.

On the portrait field: the API returns `s3Key`, a bucket key. The browser
cannot resolve a key on its own, so about.html uses it only when it is an
absolute http(s) URL. Until the API returns a resolvable URL (a CloudFront
link, or a presigned one), every member renders with the sand-colored circle
placeholder, which is not an error.

Portrait images should be:
  - square (1:1), since the circle mask trims the corners
  - ~300x300px or larger to stay sharp on retina screens
  - faces centered
