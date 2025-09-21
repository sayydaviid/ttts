# ===================================================================
# PONTO DE ENTRADA DA API (Versão Otimizada para Filtragem no Servidor)
# ===================================================================

# --- 1. Carga de Pacotes e Módulos ---
library(plumber)
library(dplyr)
library(jsonlite)
library(tidyr)
source("R/main.R")

# --- 1.1 Helpers ---
# Normaliza parâmetros vindos do frontend para representar "sem filtro"
normalize_param <- function(x) {
  if (is.null(x)) return("all")
  x_chr <- tolower(trimws(as.character(x)))
  if (x_chr %in% c("", "all", "todos", "todas", "todo", "qualquer", "none", "null", "undefined")) {
    return("all")
  }
  return(x)
}

# --- 2. Carga Inicial dos Dados ---
all_data <- load_data()
base_discente_global <- all_data$discente
base_docente_global <- all_data$docente
cat(">> Dados carregados. API pronta para iniciar.\n")

# --- 3. Definição da API ---
pr <- pr()

# --- 4. Filtro de CORS (Cross-Origin Resource Sharing) ---
pr <- pr_filter(pr, "cors", function(req, res) {
  res$setHeader("Access-Control-Allow-Origin", "*")
  res$setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res$setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
  if (req$REQUEST_METHOD == "OPTIONS") {
    res$status <- 200
    return(list())
  }
  plumber::forward()
})

# --- 5. Definição dos Endpoints ---

pr <- pr_get(pr, "/", function() {
  list(api_status = "Online", message = "Bem-vindo à API do Dashboard AVALIA.")
})

pr <- pr_get(pr, "/health", function() {
  list(status = "OK", time = Sys.time())
})

pr <- pr_get(pr, "/filters", function() {
  list(
    campus = sort(unique(c(base_discente_global$CAMPUS, base_docente_global$CAMPUS))),
    cursos = sort(unique(c(base_discente_global$CURSO,  base_docente_global$CURSO)))
  )
})


# ==========================================================
# >>>>>>>>>>>> NOVO ENDPOINT PARA OS CARDS <<<<<<<<<<<<
# ==========================================================
pr <- pr_get(
  pr, "/discente/geral/summary",
  function(campus = "all", curso = "all") {
    campus_norm <- normalize_param(campus)
    curso_norm  <- normalize_param(curso)

    # 1. Total de Respondentes (baseado nos filtros)
    dados_filtrados <- filter_data(base_discente_global, base_docente_global, campus_norm, curso_norm)$disc
    total_respondentes <- length(unique(dados_filtrados$ID))

    # 2. Rankings de Campus (calculado sobre todos os dados, ignorando filtros)
    todas_colunas_questoes <- c(colsAutoAvDisc, colsAcaoDocente, colsInfra)
    
    rankings <- base_discente_global %>%
      select(CAMPUS, all_of(todas_colunas_questoes)) %>%
      pivot_longer(
        cols = -CAMPUS,
        names_to = "questao",
        values_to = "nota"
      ) %>%
      filter(!is.na(nota) & !is.na(CAMPUS)) %>%
      mutate(nota = as.numeric(nota)) %>%
      group_by(CAMPUS) %>%
      summarise(media_geral = mean(nota, na.rm = TRUE), .groups = 'drop')

    # Encontra o melhor e o pior campus
    # .na.rm = TRUE em min/max para o caso de algum campus não ter notas
    melhor_campus <- rankings %>% filter(media_geral == max(media_geral, na.rm = TRUE)) %>% slice(1)
    pior_campus <- rankings %>% filter(media_geral == min(media_geral, na.rm = TRUE)) %>% slice(1)

    # Monta a lista de resposta
    list(
      total_respondentes = total_respondentes,
      campus_melhor_avaliado = list(
        campus = melhor_campus$CAMPUS,
        media = round(melhor_campus$media_geral, 2)
      ),
      campus_pior_avaliado = list(
        campus = pior_campus$CAMPUS,
        media = round(pior_campus$media_geral, 2)
      )
    )
  }
)


# -------------------------------
# Endpoints DISCENTES (Agregados)
# -------------------------------

pr <- pr_get(
  pr, "/discente/dimensoes/medias",
  function(campus = "all", curso = "all") {
    campus <- normalize_param(campus)
    curso  <- normalize_param(curso)

    dados_filtrados <- filter_data(
      base_discente_global, base_docente_global, campus, curso
    )$disc

    data.frame(
      dimensao = c("Autoavaliação Discente", "Ação Docente", "Instalações Físicas"),
      media = c(
        mean(unlist(dados_filtrados[, colsAutoAvDisc]), na.rm = TRUE),
        mean(unlist(dados_filtrados[, colsAcaoDocente]),  na.rm = TRUE),
        mean(unlist(dados_filtrados[, colsInfra]),        na.rm = TRUE)
      )
    )
  }
)

pr <- pr_get(
  pr, "/discente/dimensoes/proporcoes",
  function(campus = "all", curso = "all") {
    campus <- normalize_param(campus)
    curso  <- normalize_param(curso)

    dados_filtrados <- filter_data(
      base_discente_global, base_docente_global, campus, curso
    )$disc

    contagens_disc  <- lapply(dados_filtrados[, colsAutoAvDisc], table)
    contagens_doc   <- lapply(dados_filtrados[, colsAcaoDocente], table)
    contagens_infra <- lapply(dados_filtrados[, colsInfra], table)

    data.frame(
      dimensao = rep(
        c("Autoavaliação Discente", "Ação Docente", "Instalações Físicas"),
        each = length(alternativas)
      ),
      conceito = rep(conceitos, times = 3),
      valor = c(
        calculoPercent(alternativas, contagens_disc),
        calculoPercent(alternativas, contagens_doc),
        calculoPercent(alternativas, contagens_infra)
      )
    )
  }
)

pr <- pr_get(
  pr, "/discente/dimensoes/boxplot",
  function(campus = "all", curso = "all") {
    campus <- normalize_param(campus)
    curso  <- normalize_param(curso)

    dados_filtrados <- filter_data(
      base_discente_global, base_docente_global, campus, curso
    )$disc

    long_disc <- valoresUnicos(dados_filtrados, mediap111:mediap117) %>%
      pivot_longer(cols = -ID, names_to = "item", values_to = "media") %>%
      mutate(dimensao = "Autoavaliação Discente")
    long_doc <- valoresUnicos(dados_filtrados, mediap211:mediap234) %>%
      pivot_longer(cols = -ID, names_to = "item", values_to = "media") %>%
      mutate(dimensao = "Ação Docente")
    long_infra <- valoresUnicos(dados_filtrados, mediap311:mediap314) %>%
      pivot_longer(cols = -ID, names_to = "item", values_to = "media") %>%
      mutate(dimensao = "Instalações Físicas")

    df_completo <- bind_rows(long_disc, long_doc, long_infra)

    stats_por_dimensao <- df_completo %>%
      group_by(dimensao) %>%
      summarise(stats = list(boxplot.stats(na.omit(media))), .groups = "drop")

    boxplot_data <- stats_por_dimensao %>%
      transmute(
        x = dimensao,
        y = lapply(stats, function(s) s$stats)
      )

    all_outliers <- stats_por_dimensao %>%
      filter(sapply(stats, function(s) length(s$out) > 0)) %>%
      transmute(
        x = dimensao,
        outliers = lapply(stats, function(s) s$out)
      ) %>%
      unnest(outliers)

    MAX_OUTLIERS <- 200

    sampled_outliers <- all_outliers %>%
      group_by(x) %>%
      group_modify(~ if (nrow(.) > MAX_OUTLIERS) slice_sample(., n = MAX_OUTLIERS) else .) %>%
      ungroup() %>%
      rename(y = outliers)

    list(
      boxplot_data = boxplot_data,
      outliers_data = sampled_outliers
    )
  }
)

pr <- pr_get(
  pr, "/discente/atividades/percentual",
  function(campus = "all", curso = "all") {
    campus <- normalize_param(campus)
    curso  <- normalize_param(curso)

    dados_filtrados <- filter_data(
      base_discente_global, base_docente_global, campus, curso
    )$disc

    if (nrow(dados_filtrados) == 0) {
      return(data.frame(atividade = character(), percentual = numeric()))
    }

    intervalo <- dados_filtrados %>% select(all_of(colsAtividadesDisc))
    intervalo <- intervalo %>% mutate(across(everything(), as.character))
    intervalo[is.na(intervalo)] <- "0"
    intervalo[intervalo == ""]  <- "0"

    if ("4.1.1.P" %in% names(intervalo)) {
      intervalo$"4.1.1.P"[ intervalo$"4.1.1.P" != "0" & intervalo$"4.1.1.P" != "1" ] <- "1"
    }

    intervalo   <- mutate_all(intervalo, as.numeric)
    contagem    <- colSums(intervalo == 1, na.rm = TRUE)
    percentuais <- (contagem / nrow(dados_filtrados)) * 100

    data.frame(
      atividade  = LETTERS[seq_along(percentuais)],
      percentual = percentuais
    )
  }
)

# ==========================================================
# Endpoints DETALHADOS por item (Autoavaliação)
# ==========================================================

# Helper para rotular itens (ex.: "P111" -> "1.1.1")
.label_itens_auto <- function(cols) {
  gsub("^P(\\d{1})(\\d{1})(\\d{1})$", "\\1.\\2.\\3", cols)
}

# Proporções por item (Excelente/Bom/Regular/Insuficiente)
pr <- pr_get(
  pr, "/discente/autoavaliacao/itens/proporcoes",
  function(campus = "all", curso = "all") {
    campus <- normalize_param(campus)
    curso  <- normalize_param(curso)

    dados <- filter_data(base_discente_global, base_docente_global, campus, curso)$disc
    itens <- dados[, colsAutoAvDisc, drop = FALSE]

    dados_longos <- itens %>%
        pivot_longer(
            cols = everything(),
            names_to = "item",
            values_to = "valor"
        ) %>%
        filter(!is.na(valor)) %>%
        count(item, valor) %>%
        group_by(item) %>%
        mutate(
            total_item = sum(n),
            percentual = (n / total_item) * 100
        ) %>%
        ungroup()

    resultado_final <- dados_longos %>%
        complete(item, valor = alternativas, fill = list(n = 0, total_item = 0, percentual = 0)) %>%
        mutate(
            item = .label_itens_auto(item),
            conceito = conceitos[as.numeric(valor)]
        ) %>%
        select(item, conceito, valor = percentual)

    return(resultado_final)
  }
)

# Médias por item
pr <- pr_get(
  pr, "/discente/autoavaliacao/itens/medias",
  function(campus = "all", curso = "all") {
    campus <- normalize_param(campus)
    curso  <- normalize_param(curso)

    dados <- filter_data(base_discente_global, base_docente_global, campus, curso)$disc
    itens <- dados[, colsAutoAvDisc, drop = FALSE]
    itens[] <- lapply(itens, function(v) suppressWarnings(as.numeric(v)))

    medias <- sapply(itens, function(col) mean(col, na.rm = TRUE))
    data.frame(
      item  = .label_itens_auto(names(medias)),
      media = as.numeric(medias),
      stringsAsFactors = FALSE
    )
  }
)

# Helper específico para os nomes de colunas de média do boxplot (ex: "mediap111" -> "1.1.1")
.label_itens_media <- function(cols) {
  gsub("^mediap(\\d{1})(\\d{1})(\\d{1})$", "\\1.\\2.\\3", cols)
}

# Boxplot por item
pr <- pr_get(
  pr, "/discente/autoavaliacao/itens/boxplot",
  function(campus = "all", curso = "all") {
    campus <- normalize_param(campus)
    curso  <- normalize_param(curso)

    dados <- filter_data(base_discente_global, base_docente_global, campus, curso)$disc
    itens <- valoresUnicos(dados, mediap111:mediap117)

    box_df_list <- list()
    out_df_list <- list()

    for (nm in names(itens)) {
      if (nm == "ID") next
      
      vec <- itens[[nm]]
      vec <- vec[!is.na(vec)]
      if (length(vec) == 0) next
      bs  <- boxplot.stats(vec)
      box_df_list[[length(box_df_list) + 1]] <- data.frame(
        x = .label_itens_media(nm),
        y = I(list(bs$stats))
      )
      if (length(bs$out) > 0) {
        out_df_list[[length(out_df_list) + 1]] <- data.frame(
          x = .label_itens_media(nm),
          y = as.numeric(bs$out)
        )
      }
    }

    boxplot_data  <- if (length(box_df_list)) do.call(rbind, box_df_list) else data.frame(x = character(), y = I(list()))
    outliers_data <- if (length(out_df_list)) do.call(rbind, out_df_list) else data.frame(x = character(), y = numeric())

    list(
      boxplot_data = boxplot_data,
      outliers_data = outliers_data
    )
  }
)

# Médias por item para Atitude Profissional
pr <- pr_get(
  pr, "/discente/atitudeprofissional/itens/medias",
  function(campus = "all", curso = "all") {
    campus <- normalize_param(campus)
    curso  <- normalize_param(curso)

    dados <- filter_data(base_discente_global, base_docente_global, campus, curso)$disc
    itens <- dados[, colsAtProfissional, drop = FALSE]
    itens[] <- lapply(itens, function(v) suppressWarnings(as.numeric(v)))

    medias <- sapply(itens, function(col) mean(col, na.rm = TRUE))
    data.frame(
      item  = .label_itens_auto(names(medias)),
      media = as.numeric(medias),
      stringsAsFactors = FALSE
    )
  }
)



# Proporções por item para Instalações Físicas
pr <- pr_get(
  pr, "/discente/instalacoes/itens/proporcoes",
  function(campus = "all", curso = "all") {
    campus <- normalize_param(campus)
    curso  <- normalize_param(curso)
    dados <- filter_data(base_discente_global, base_docente_global, campus, curso)$disc
    itens <- dados[, colsInfra, drop = FALSE]
    
    dados_longos <- itens %>%
        pivot_longer(
            cols = everything(),
            names_to = "item",
            values_to = "valor"
        ) %>%
        filter(!is.na(valor)) %>%
        count(item, valor) %>%
        group_by(item) %>%
        mutate(
            total_item = sum(n),
            percentual = (n / total_item) * 100
        ) %>%
        ungroup()

    resultado_final <- dados_longos %>%
        complete(item, valor = alternativas, fill = list(n = 0, total_item = 0, percentual = 0)) %>%
        mutate(
            item = .label_itens_auto(item),
            conceito = conceitos[as.numeric(valor)]
        ) %>%
        select(item, conceito, valor = percentual)
        
    return(resultado_final)
  }
)

# ==========================================================
# >>>>>>>>>>>> NOVO ENDPOINT ADICIONADO AQUI <<<<<<<<<<<<
# ==========================================================
# Médias por item para Gestão Didática
pr <- pr_get(
  pr, "/discente/gestaodidatica/itens/medias",
  function(campus = "all", curso = "all") {
    campus <- normalize_param(campus)
    curso  <- normalize_param(curso)
    dados <- filter_data(base_discente_global, base_docente_global, campus, curso)$disc
    # Seleciona as colunas corretas de config.r
    itens <- dados[, colsGestaoDidatica, drop = FALSE]
    itens[] <- lapply(itens, function(v) suppressWarnings(as.numeric(v)))
    medias <- sapply(itens, function(col) mean(col, na.rm = TRUE))
    data.frame(
      item  = .label_itens_auto(names(medias)), # Reutiliza o helper
      media = as.numeric(medias),
      stringsAsFactors = FALSE
    )
  }
)

# ==========================================================
# >>>>>>>>>>>> NOVO ENDPOINT FINAL ADICIONADO AQUI <<<<<<<<<<<<
# ==========================================================
# Médias por item para Processo Avaliativo
# Médias por item para Processo Avaliativo
pr <- pr_get(
  pr, "/discente/processoavaliativo/itens/medias",
  function(campus = "all", curso = "all") {
    campus <- normalize_param(campus)
    curso  <- normalize_param(curso)
    dados <- filter_data(base_discente_global, base_docente_global, campus, curso)$disc
    # Seleciona as colunas corretas de config.r
    itens <- dados[, colsProcAvaliativo, drop = FALSE]
    itens[] <- lapply(itens, function(v) suppressWarnings(as.numeric(v)))
    medias <- sapply(itens, function(col) mean(col, na.rm = TRUE))
    data.frame(
      item  = .label_itens_auto(names(medias)), # Reutiliza o helper
      media = as.numeric(medias),
      stringsAsFactors = FALSE
    )
  }
)


pr <- pr_get(
  pr, "/discente/instalacoes/itens/medias",
  function(campus = "all", curso = "all") {
    campus <- normalize_param(campus)
    curso  <- normalize_param(curso)
    dados <- filter_data(base_discente_global, base_docente_global, campus, curso)$disc
    # Seleciona as colunas corretas de config.r
    itens <- dados[, colsInfra, drop = FALSE]
    itens[] <- lapply(itens, function(v) suppressWarnings(as.numeric(v)))
    medias <- sapply(itens, function(col) mean(col, na.rm = TRUE))
    data.frame(
      item  = .label_itens_auto(names(medias)), # Reutiliza o helper
      media = as.numeric(medias),
      stringsAsFactors = FALSE
    )
  }
)




# ----------------------------
# Endpoints DOCENTES (Agregados)
# ----------------------------

pr <- pr_get(
  pr, "/docente/dimensoes/medias",
  function(campus = "all", curso = "all") {
    campus <- normalize_param(campus)
    curso  <- normalize_param(curso)

    dados_filtrados <- filter_data(
      base_discente_global, base_docente_global, campus, curso
    )$doc

    data.frame(
      dimensao = c(
        "Avaliação da Turma",
        "Autoavaliação da Ação Docente",
        "Instalações Físicas"
      ),
      media = c(
        mean(unlist(dados_filtrados[, colsAvTurmaDoc]),     na.rm = TRUE),
        mean(unlist(dados_filtrados[, colsAcaoDocenteDoc]), na.rm = TRUE),
        mean(unlist(dados_filtrados[, colsInfraDoc]),       na.rm = TRUE)
      )
    )
  }
)

pr <- pr_get(
  pr, "/docente/dimensoes/proporcoes",
  function(campus = "all", curso = "all") {
    campus <- normalize_param(campus)
    curso  <- normalize_param(curso)

    dados_filtrados <- filter_data(
      base_discente_global, base_docente_global, campus, curso
    )$doc

    contagem_turma <- lapply(dados_filtrados[, colsAvTurmaDoc],     table)
    contagem_acao  <- lapply(dados_filtrados[, colsAcaoDocenteDoc], table)
    contagem_infra <- lapply(dados_filtrados[, colsInfraDoc],       table)

    data.frame(
      dimensao = rep(
        c("Avaliação da Turma", "Autoavaliação da Ação Docente", "Instalações Físicas"),
        each = 4
      ),
      conceito = rep(conceitos, times = 3),
      valor = c(
        calculoPercent(alternativas, contagem_turma),
        calculoPercent(alternativas, contagem_acao),
        calculoPercent(alternativas, contagem_infra)
      )
    )
  }
)

pr <- pr_get(
  pr, "/docente/atividades/percentual",
  function(campus = "all", curso = "all") {
    campus <- normalize_param(campus)
    curso  <- normalize_param(curso)

    dados_filtrados <- filter_data(
      base_discente_global, base_docente_global, campus, curso
    )$doc

    if (nrow(dados_filtrados) == 0) {
      return(data.frame(atividade = character(), percentual = numeric()))
    }

    intervalo <- dados_filtrados %>% select(all_of(colsAtividadesDoc))
    intervalo <- intervalo %>% mutate(across(everything(), as.character))
    intervalo[is.na(intervalo)] <- "0"
    intervalo[intervalo == ""]  <- "0"

    if ("4.1.1.P" %in% names(intervalo)) {
      intervalo$"4.1.1.P"[ intervalo$"4.1.1.P" != "0" & intervalo$"4.1.1.P" != "1" ] <- "1"
    }

    intervalo   <- mutate_all(intervalo, as.numeric)
    contagem    <- colSums(intervalo == 1, na.rm = TRUE)
    percentuais <- (contagem / nrow(dados_filtrados)) * 100

    data.frame(
      atividade  = LETTERS[seq_along(percentuais)],
      percentual = percentuais
    )
  }
)

# --- 6. Iniciar o Servidor ---
pr_run(pr, host = "0.0.0.0", port = 8000)