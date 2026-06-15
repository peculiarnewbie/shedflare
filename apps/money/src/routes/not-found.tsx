import { useNavigate } from "@solidjs/router";

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div class="page" style={{ "text-align": "center", "padding-top": "48px" }}>
      <h1 class="page-title">404</h1>
      <p class="page-subtitle">The page you're looking for doesn't exist.</p>
      <button class="btn btn-primary" onClick={() => navigate("/")}>
        Go home
      </button>
    </div>
  );
}
